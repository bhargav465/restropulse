# Content Engine AI - Rollout Runbook

This runbook describes the staged rollout of the AI content generator behind feature flags. Each stage is independently rollback-able by flipping its flag back to default. The placeholder backend remains a permanent operational fallback -- it is not a temporary toggle.

## Pre-flight

Before any flag is flipped:

1. Application Insights connection string is configured for the content-engine deployment slot (workbooks won't populate otherwise).
2. The two workbooks (`cost-by-restaurant`, `per-post-audit`) are imported into the Azure Portal under the App Insights resource. See `infra/workbooks/` for the JSON templates.
3. Cost ceilings are agreed with billing: dashboards exist but alerts are operator's call.
4. Every required API key for the target stage is provisioned (see stage env vars below). Missing keys cause the worker to throw at boot rather than silently degrade.

## Stages

Stages are additive. Each stage subsumes the previous stage's flags.

### Stage 0: Default (placeholder, no AI)

```
CONTENT_GENERATOR_BACKEND=placeholder   # default
MEDIA_BACKEND=placeholder               # default
```

Behavior: the existing asset-catalog generator runs. No external AI calls. Zero cost. This is what production runs today and what every rollback target should be.

### Stage 1: AI captions + cycles + V1 calendar (LLM only, no fal.ai)

Flip these env vars on the staging deployment first; observe for 24 hours; then promote to production.

```
CONTENT_GENERATOR_BACKEND=ai
ANTHROPIC_API_KEY=<key>
GOOGLE_CALENDAR_API_KEY=<key>
# CURRENT_AFFAIRS_V1_ENABLED=true is the default
```

**What happens:** Anthropic Sonnet/Haiku produces real cycles + captions. Calendar V1 auto-injects "Today is..." and nearby India holiday hints. Media still comes from the asset catalog (post.thumbnail / videoUrl point at the local asset server).

**Smoke check at boot:**
```bash
cd apps/content-engine && CONTENT_GENERATOR_BACKEND=ai ANTHROPIC_API_KEY=<key> GOOGLE_CALENDAR_API_KEY=<key> npx tsx --eval "import('./src/services/content-generator/factory.js').then(m => { m.createContentGenerator('ai'); console.log('currentAffairs:', m.getLastAiCurrentAffairsProvider()?.name); })"
# expected: currentAffairs: calendar-only
```

**Monitor:**
- `cost-by-restaurant` workbook (LLM surface only). Validate per-restaurant LLM cost is within expected band (~\$0.10-0.30/restaurant/month).
- Application Insights traces -> filter `customDimensions.operation in ('draftCycle','generatePost')`. Watch for spikes in `durationMs`.
- The content-engine worker logs: look for `AIContentGenerator instantiated` at boot.

**Rollback:** unset `CONTENT_GENERATOR_BACKEND` (or set to `placeholder`). No data cleanup needed.

### Stage 2: AI image generation (fal.ai for IMAGE/STORY/CAROUSEL)

```
CONTENT_GENERATOR_BACKEND=ai
ANTHROPIC_API_KEY=<key>
GOOGLE_CALENDAR_API_KEY=<key>
MEDIA_BACKEND=fal-ai
FAL_API_KEY=<key>
```

**What happens:** IMAGE / STORY / CAROUSEL posts route through fal.ai Flux dev (text-to-image) or Flux dev image-to-image (when `baseImageUrl` is supplied). CAROUSEL fans out to 3 parallel calls. REEL/VIDEO posts will fail with `BACKEND_UNAVAILABLE` until Stage 3.

**Smoke check at boot:**
```bash
... MEDIA_BACKEND=fal-ai FAL_API_KEY=<key> npx tsx --eval "import('./src/services/content-generator/factory.js').then(m => { m.createContentGenerator('ai'); console.log('store:', m.getLastAiMediaJobStore() ? 'set' : 'null', 'media:', m.getLastAiMediaGenerator()?.name); })"
# expected: store: set media: fal-ai
```

**Monitor:**
- `cost-by-restaurant` workbook (image surface). 30 IMAGE posts/month/restaurant at \$0.025/call ~ \$0.75/month.
- Inspect `mediaJobs` collection: every IMAGE post now writes one row. CAROUSEL writes 3.
- `per-post-audit` workbook -> spot-check a few postIds end-to-end.

**Caveat:** REEL/VIDEO posts created during Stage 2 will fail with `BACKEND_UNAVAILABLE`. Either pause REEL/VIDEO scheduling at the application layer, or jump straight to Stage 3.

**Rollback:** set `MEDIA_BACKEND=placeholder`. No data cleanup needed; existing `mediaJobs` rows are harmless.

### Stage 3: AI video generation (fal.ai queue + poller)

Same env vars as Stage 2. The poller cron and post-resume scan auto-register because `MEDIA_BACKEND=fal-ai` is set; no extra flag needed.

**What happens:** REEL / VIDEO posts now submit to fal.ai's queue API (default model: Kling 1.6 standard). Posts move to `PENDING_MEDIA` while the queue runs. The `media-job-poller` cron (every 30s) advances them to `PENDING_APPROVAL` when fal.ai completes. Stale jobs (>10 min) are reaped as `MISSED_DEADLINE` with diagnostic on `publishError`.

**Smoke check:**
- Boot the worker. Logs should include `media-job-poller processor registered`.
- Submit a test REEL post; observe in DB: `status=PENDING_MEDIA`, `mediaJobId=...` set within seconds. Up to 2 minutes later: `status=PENDING_APPROVAL`, `videoUrl` populated.

**Monitor:**
- `cost-by-restaurant` workbook (video surface). \$0.30/clip default.
- `mediaJobs` collection: count of `RUNNING` jobs (steady-state should hover near 0). Sustained `RUNNING` count > 10 indicates fal.ai queue backlog or polling misconfiguration.
- Worker logs: `media-job-poller tick { count: N }` should appear every 30s.

**Open item -- web UI:** the new `PENDING_MEDIA` PostStatus needs a label/spinner in the studio UI. The web team must update `apps/web` separately. Until then, the studio will likely render PENDING_MEDIA posts with a blank or unknown-status badge for the duration the video is in flight (up to 2 minutes typical, 10 minutes worst-case).

**Rollback:** set `MEDIA_BACKEND=placeholder`. Posts already in `PENDING_MEDIA` with a fal job in flight will be reaped as stale within 10 minutes; operators can manually advance them by running a post-resume scan or manually applying the latest fal queue result.

### Stage 4 (optional): Sonar Pro current-affairs

```
... all Stage 3 vars ...
CURRENT_AFFAIRS_V2_ENABLED=true
PERPLEXITY_API_KEY=<key>
```

**What happens:** `current-affairs-refresh` cron (06:00 IST daily) now fires one Perplexity Sonar Pro call asking for India-wide trending topics. The response is cached in `currentAffairsCache` and shared across all restaurants. Per-post Sonar calls fire when the post concept matches the trigger keyword allowlist (sports/festivals/weather/celebrations).

**Cost:** ~\$0.10/day platform-wide for the daily refresh + ~\$0.30-0.90/restaurant/month for per-post triggers (assuming ~20% trigger rate on 30 posts/month).

**Monitor:**
- `cost-by-restaurant` workbook (sonar surface).
- `currentAffairsCache` collection should contain a `sonar-daily:YYYY-MM-DD` entry within 24h.

**Rollback:** unset `CURRENT_AFFAIRS_V2_ENABLED` or set to `false`.

## Per-stage observations checklist

After each promotion to production:

- [ ] cost-by-restaurant workbook shows the new surface
- [ ] worker logs include the expected boot lines (factory + processors)
- [ ] no spikes in worker error logs over the next 60 minutes
- [ ] no spikes in cost beyond the expected envelope

## Emergency rollback

To stop all AI behavior immediately:

```
CONTENT_GENERATOR_BACKEND=placeholder
```

This forces every operation back to the asset-catalog generator. Any in-flight `mediaJobs` rows can be left as-is; the poller no longer registers and the rows become inert.

## Reference

- ADR 0001: docs/adr/0001-content-engine-ai-framework.md (full rationale, decision drivers, alternatives)
- Plans: docs/superpowers/plans/2026-05-03-content-engine-ai-phase-{1..6}.md (per-phase implementation breakdown)
- Workbooks: infra/workbooks/cost-by-restaurant.workbook.json, per-post-audit.workbook.json
