# Spec: Content-Engine AI Framework + Current-Affairs RAG ADR

**Status**: Approved through brainstorming; ready for implementation planning.
**Date**: 2026-05-03
**Final ADR location**: `docs/adr/0001-content-engine-ai-framework.md`
**This document**: design captured during brainstorming; the writing-plans skill will turn it into the implementation plan for authoring the ADR file.

---

## 1. Problem Statement

The content-engine (`apps/content-engine`) currently uses `PlaceholderContentGenerator` — a heuristic, asset-catalog-based implementation of `IContentGenerator` with four operations: `draftCycle`, `reviseCycle`, `generatePost`, `revisePost`. The placeholder produces non-AI output: it picks pre-existing media files from `assets/` and assembles captions from string templates.

The next phase requires a real AI-backed `IContentGenerator` that:
- Generates images, videos, and captions from scratch via AI APIs (not asset selection)
- Modifies user-provided images (img2img / inpainting)
- Leverages real-time current affairs (news, holidays, sports, regional events)
- Leverages trending hashtags
- Orchestrates 3–4 external API calls per post in a multi-step workflow
- Tolerates long-running operations (video generation: 30–120s)
- Tracks cost per `restaurantId` and `postId` for SaaS billing transparency
- Routes telemetry through the existing `@restropulse/telemetry` → Azure Monitor pipeline

The ADR must select an LLM/agent framework, decide a current-affairs RAG strategy, and scope the implementation patterns required to satisfy the above.

---

## 2. Decision Drivers (priority order)

1. **Time-to-robust-product (P0)** — minimal cognitive load, idiomatic TypeScript, slides into existing `IContentGenerator` interface without architectural changes.
2. **Cost (P0)** — per-call model selection (Haiku for cheap steps, Sonnet for reasoning), Anthropic prompt caching, transparent token attribution per `restaurantId`/`postId`.
3. **Model portability (P1)** — swapping Anthropic ↔ OpenAI ↔ Google must not require rewriting orchestration logic.
4. **Multi-modal orchestration (P1)** — text + image + video API calls in one workflow, with optional user-image editing.
5. **Long-running operation tolerance (P1)** — video generation polls (30–120s) must not block other content-engine cron processors.
6. **Telemetry integration (P1)** — must emit OpenTelemetry spans into the existing `@restropulse/telemetry` → Azure Monitor pipeline; no proprietary observability lock-in.
7. **Per-customer cost attribution (P1)** — every LLM/image/video API call must be labelable by `restaurantId`, `postId`, `cycleId`, `operation`, `model`, `step`.
8. **Vendor lock-in posture (P2)** — escape hatch must be ≤200 LOC if framework dies.

---

## 3. Decision: Framework

**Adopt Vercel AI SDK (`ai` package + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` providers) as the LLM and tool-orchestration layer. Build a thin custom orchestrator inside `apps/content-engine/src/services/content-generator/ai-generator/` that implements `IContentGenerator` by composing typed async functions.**

### Rationale

- Most mature TypeScript LLM library; provider neutrality at zero cost.
- First-class structured output via Zod (`generateObject`).
- Native Anthropic prompt caching support.
- Emits OpenTelemetry spans via `experimental_telemetry: { isEnabled: true }` — routes directly into existing `@restropulse/telemetry` pipeline.
- The four `IContentGenerator` operations are bounded enough that a custom orchestrator is faster to write than learning an agent DSL — and remains easy to evolve toward Mastra or LangGraph if multi-agent patterns later emerge.
- Vercel AI SDK is MIT-licensed OSS; no Vercel-hosted features used; **$0/month Vercel cost**.

### Alternatives considered (full scoring matrix in §4 of the ADR; summary here)

| Framework | Why rejected |
|---|---|
| Claude Agent SDK | Anthropic-only — conflicts with model-portability driver |
| Claude Managed Agents | Hosted, opaque, expensive at scale |
| LangGraph.js | More mature than Mastra but verbose TS DX (Python port); state-graph DSL is over-tooled for our 4 bounded operations |
| Mastra | Promising TS-first agent framework, built on Vercel AI SDK underneath; rejected on maturity risk — ~6 months younger, API still evolving, smaller community |
| Direct `@anthropic-ai/sdk` | Best Claude DX but locks us to Anthropic — conflicts with model-portability driver |
| OpenAI Agents SDK | OpenAI-centric mindshare, weak Anthropic ergonomics |
| Inngest Agent Kit | Strong durability but ties us to Inngest as a runtime dependency; we only need partial durability, achievable in MongoDB |
| CrewAI-JS / AutoGen ports | TypeScript ports of Python frameworks; significantly less mature in TS than originals |

### Scoring approach (for §4 of the ADR)

- Render full 11-axis × 9-framework matrix as a single weighted table (each cell scored 1–5 with weighted total). Primary-source citation appears once per framework header.
- Tiered narrative: matrix is followed by prose covering only the **top 4 contenders** in detail (Vercel AI SDK, LangGraph.js, Mastra, Direct `@anthropic-ai/sdk`). The other 5 get a one-paragraph dismissal each citing the single dominant disqualifier.
- Scoring rubric documented inline so future readers can re-score: 1 = absent/broken, 3 = workable with effort, 5 = best-in-class.
- Each axis weight comes straight from the original plan (1×–2×).

---

## 4. Decision: Current-Affairs RAG Strategy

Three explicit tiers, with V1 + V2 in scope for the initial release and V3 documented as a deferred future option.

### V1 — Calendar/holiday injection (in scope, ships first)

- **Source**: Google Calendar Public Holidays API, India calendar (`en.indian#holiday@group.v.calendar.google.com`)
- **Cadence**: daily refresh job at 06:00 IST, cached in MongoDB for 24h
- **What gets injected**: `today's date / weekday / month / India holiday name (if within ±3 days)`
- **Cost**: $0 incremental
- **Build**: ~150–200 LOC, 2–3 days

### V2 — Real-time current affairs (in scope, ships in same release as V1)

- **Source**: Perplexity Sonar Pro API as unified current-affairs + trending-hashtags oracle
- **Cadence (two-tier)**:
  1. **Daily refresh** at 06:00 IST: one Sonar call asking *"What are the major events, sports outcomes, festivals, weather events, and trending topics in India today and tomorrow that a restaurant might want to reference in social media content?"* — cached 24h, shared across all restaurants
  2. **Per-post hyperlocal augmentation**: at `generatePost` time, if `concept` matches an allowlist of triggers (sports, festivals, weather, regional cuisine), make a targeted Sonar call for that specific angle
- **Cost**: ~$0.10/day platform-wide (daily refresh) + ~$0.30–0.90/restaurant/month (per-post triggers at ~20% rate)
- **Build**: ~300–500 LOC, 4–5 days

### V3 — Brand-voice / restaurant-specific RAG (DEFERRED, documented for future)

V3 is **not built** in the initial release. Documented in the ADR with explicit triggers for revisiting:

- **Triggers to build V3** (any one is sufficient):
  - Brand-voice complaints appear in ≥10% of revision-feedback `tags` over a rolling 30-day window
  - A multi-restaurant brand customer (≥3 restaurants under one brand) onboards
  - Restaurant retention analytics identify "AI-generated content doesn't sound like us" as a top-3 churn reason
- **What V3 would do**: embed past approved posts per restaurant; retrieve top-K most semantically similar approved posts during caption generation to maintain brand voice consistency.
- **Primary backing store**: MongoDB Atlas Vector Search (already running Atlas; no new infrastructure; available on existing M10+ tier).
- **Embedding model**: deferred to V3 ADR; likely `voyage-3` or `text-embedding-3-large`.
- **Vector store alternatives documented but rejected for V3**:
  - pgvector — requires Postgres alongside Mongo; operational overhead not worth it
  - sqlite-vec / LanceDB / hnswlib-node — embedded options don't scale to multi-instance content-engine
  - Pinecone — paid SaaS, redundant with Atlas Vector
  - Chroma — workable but smaller community than Atlas Vector
- **Operational complexity that V3 introduces** (and why it's deferred):
  - Embedding pipeline lifecycle (when does a post get embedded? on approval? on publish? backfill?)
  - Vector index versioning (re-embed when prompts evolve?)
  - Cold-start problem (new restaurants have no past content)
  - Quality evaluation (how do you know retrieval is helping vs. hurting?)
  - Embedding/storage/retrieval cost overhead
- **Estimated V3 build time when triggered**: 7–10 days plus ongoing operational cost.

### Summary table

| Tier | Scope | Build now? | Cost/restaurant/month |
|---|---|---|---|
| V1 | Calendar/holiday injection | YES | $0 |
| V2 | Daily Sonar refresh + per-post hyperlocal triggers | YES | ~$0.30–1.00 |
| V3 | Atlas Vector Search for brand voice | NO — deferred with explicit triggers | n/a |

---

## 5. Decision: Implementation Patterns (in scope)

The framework choice doesn't earn its keep without these patterns explicitly designed and built. All four are **mandatory scope**, not "tracked separately."

### 5.1 Retry layer

- Helper: `withRetry(fn, { maxAttempts, backoff: "exponential", retryOn: [TransientError, RateLimitError] })`
- Wraps every external API call (Anthropic, Sonar, fal.ai, etc.)
- Profiles per surface (these are *retry intervals between attempts*, not polling intervals during a single attempt):
  - LLM: 3 attempts, 1s/2s/4s backoff
  - Image gen submission: 3 attempts, 5s/10s/20s backoff
  - Video gen submission: 5 attempts, 10s/20s/40s/80s/160s backoff
  - Video gen polling (separate concern, see §5.2): the `mediaJobPoller` cron runs every 30s and polls each RUNNING job; not a retry loop
- Never retry on 4xx (auth/validation); always retry on 429/502/503/504

### 5.2 Video-generation polling — durable, non-blocking

- New MongoDB collection: `mediaJobs`
- Schema: `{ jobId, restaurantId, postId, provider, providerJobId, status: PENDING|RUNNING|COMPLETED|FAILED, startedAt, lastPolledAt, mediaUrl, error, attempts }`
- New post status: `PENDING_MEDIA`, with `mediaJobId` set
- Submission flow inside `generatePost`:
  1. Submit video gen job → write `mediaJobs` row → return job reference (don't block)
  2. Post moves to `PENDING_MEDIA`
- New cron processor: `mediaJobPoller` (every 30s)
  - Finds RUNNING jobs, polls provider, updates `mediaJobs` and post when done
  - Stale RUNNING jobs (>10 min) reset to PENDING for retry
- Worker never blocks for 30–120s; submits and returns

### 5.3 Crash-safe partial durability

Explicitly **not** implementing exactly-once tool execution or time-travel debugging. Implementing:

- **Idempotent operations**: use `jobId` as deduplication key on every external API call
- **Checkpointable progress**: `generationStep` field on post: `SEARCHING_TRENDS → CAPTION_DONE → MEDIA_REQUESTED → MEDIA_DONE`
- **Resume on crash**: worker startup scans posts in non-terminal states older than 5 min and re-enqueues from last checkpoint

This matches what the Python reference (`D:\Work\restx-experimental\restx-experimental\src\agents\supervisor_revised.py:27,359`) achieves in practice (uses LangGraph `MemorySaver` — in-memory only, lost on restart) and exceeds it on durability.

### 5.4 Cost tracking + observability

- Helper: `withCostTracking(fn, { restaurantId, postId, cycleId, operation, model, step })`
- Emits OTel metrics with these dimensions: `genai.tokens.input`, `genai.tokens.output`, `genai.cost.usd`, `genai.duration.ms`
- Persists denormalized rows to `cost_events` MongoDB collection for fast aggregation
- **Two Azure Monitor Workbooks delivered as part of this scope**:
  1. **Cost-by-restaurant**: stacked bar chart (LLM / image / video / Sonar) per restaurant per month
  2. **Per-post audit**: drill into any `postId` and see every API call, its tokens, its cost, its latency

---

## 6. Decision: Image / Video Generation API

Scoped IN to this ADR; not a separate tracking item.

### Pluggable interface

```typescript
interface IMediaGenerator {
  readonly name: string;
  generateImage(input: ImageGenInput, ctx?: GenerationContext): Promise<MediaGenJob>;
  generateVideo(input: VideoGenInput, ctx?: GenerationContext): Promise<MediaGenJob>;
  editImage(input: ImageEditInput, ctx?: GenerationContext): Promise<MediaGenJob>;
  pollJob(jobId: string): Promise<MediaJobStatus>;
}

type MediaGenJob = { jobId: string; status: "PENDING"|"RUNNING"|"COMPLETED"; mediaUrl?: string };
```

### Concrete implementations

| Provider | Use for | Cost (est.) | Status |
|---|---|---|---|
| **fal.ai** | Image gen (Flux dev), image edit (Flux fill), video (Kling 1.6 / MiniMax) | ~$0.025/image, ~$0.30–0.50/clip | **Primary, build now** |
| **Replicate** | Same surfaces, fallback | similar pricing | **Documented fallback only** |
| **Runway** | Premium-tier video for paid customers (Gen-3) | ~$0.50–0.95/clip | **Deferred — gate behind premium subscription tier** |

Why fal.ai primary: fastest inference (1–3s for image), cheapest, supports both image and video on a single API key, supports inpainting and image editing for the user-image-modification use case.

### Scope into this ADR

- `IMediaGenerator` interface
- `FalAIMediaGenerator` concrete impl
- `mediaJobs` durable polling pattern (overlaps with §5.2)
- Replicate documented as fallback path
- Runway deferred

---

## 7. Decision: Pluggable Component Architecture

Every layer is independently swappable behind an interface.

```
IContentGenerator (top-level contract; already exists in code today)
  └── AIContentGenerator (Vercel-AI-SDK-based concrete impl, NEW)
       ├── ILLMProvider                 ← Vercel AI SDK abstracts; one-import swap
       ├── ICurrentAffairsProvider      ← V1 / V2 / V3 are decorators here
       ├── IMediaGenerator              ← fal.ai / Replicate / Runway impls swap here
       └── IMediaJobStore               ← Mongo today; could become Redis/Postgres later
```

### Decorator pattern for V1/V2/V3 plug-ability

```typescript
// V1 alone
const provider = new CalendarOnlyProvider();

// V1 + V2 (production target for first release)
const provider = new SonarAugmentedProvider(
  new CalendarOnlyProvider(),
  { dailyRefreshCache, sonarClient }
);

// V1 + V2 + V3 (future, no other code changes)
const provider = new BrandVoiceProvider(
  new SonarAugmentedProvider(
    new CalendarOnlyProvider(),
    { dailyRefreshCache, sonarClient }
  ),
  { atlasVectorClient, embeddingClient }
);
```

Each layer:
- Reads upstream context, adds its own contribution, returns enriched `CurrentAffairsContext`
- Has its own toggle env var (e.g. `CURRENT_AFFAIRS_V2_ENABLED=true`)
- Can be unit-tested in isolation
- Can be removed/replaced without touching siblings

Same composition pattern applies to `IMediaGenerator` and `ILLMProvider`.

---

## 8. Consequences (for §8 of the ADR)

### Positive

- Provider portability preserved — model swap is a one-import change
- Smallest cognitive load for engineers familiar with TypeScript; no new DSL
- Anthropic prompt caching available immediately on Claude Sonnet 4.6 / Haiku 4.5
- Per-call cost attribution by `restaurantId`/`postId` enables transparent SaaS billing math
- OpenTelemetry spans flow into existing Azure Monitor without new infra
- V1+V2 RAG ships in ~6–8 days; total RAG cost <$1/restaurant/month at MVP scale
- Custom orchestrator is small enough (~200 LOC) to rewrite in a week if needed
- Pluggable architecture means V3 / alternative providers / framework migration are future options, not rewrites

### Negative

- We commit to maintaining ~600–800 LOC of orchestration / durability / cost-tracking code (vs. delegating to a framework)
- No time-travel debugging — if a multi-step workflow fails 4 steps in, we replay from last checkpoint, not from arbitrary state
- MongoDB-backed job store ties durability to MongoDB availability (acceptable; entire app already does)
- Brand-voice consistency relies on prompting alone until V3 ships — quality may plateau for established restaurants
- No built-in agent observability dashboards — we rely on Azure Monitor Workbooks built against our own metrics (in scope per §5.4, but ours to maintain)

### Neutral

- Image/video generation primary is fal.ai with Replicate as fallback path; cost monitoring in §5.4 will surface if pricing drifts
- Embedding model choice for V3 deferred to that ADR

---

## 9. Exit Criteria (for §9 of the ADR)

Trigger a revisit of this ADR if **any** of:

1. **Vercel AI SDK license change**: Vercel changes the OSS license of the `ai` package or `@ai-sdk/*` providers (currently MIT — free OSS).
2. **EoL / abandonment**: Vercel deprecates or unmaintains the `ai` package (>6 months without releases, or formal deprecation notice).
3. **Compliance**: a customer requires hosted agent observability with SOC 2 attestation. Mitigation path is **not** to switch SDK — it's to add LangSmith ($39+/user/mo) or migrate to a SOC 2-attested agent platform.
4. **Capability gap**: the generator pipeline grows to ≥3 sub-agents, or requires durable execution semantics (resumable workflows from arbitrary state, exactly-once tool execution, time-travel debugging) that custom code becomes infeasible to maintain. In that case, migrate to LangGraph.js or Mastra.
5. **Perplexity Sonar pricing ≥2× current** (currently ~$1/M Sonar / ~$3/M Sonar Pro) — switch to Brave Search + custom Claude Haiku summarization.
6. **MongoDB Atlas Vector Search pricing model changes** before V3 ships — re-evaluate vs. pgvector.
7. **fal.ai outage rate or pricing change**: switch to Replicate using the already-documented fallback impl.

---

## 10. Out of Scope (clarified)

The following are explicitly NOT decided by this ADR and will require their own ADRs / specs:

- Specific prompt content for `draftCycle` / `reviseCycle` / `generatePost` / `revisePost` (covered in implementation plan)
- Embedding model choice for V3 (deferred to V3 ADR)
- The plan-limit / credit-cost economics around AI generation (separate billing decision)
- Image generation safety / NSFW filtering (separate ADR)
- Multi-language support beyond English + Hindi/Hinglish prompts

---

## 11. Implementation Plan Inputs

For the writing-plans skill that runs after this spec:

- **Final ADR location**: `docs/adr/0001-content-engine-ai-framework.md` (create `docs/adr/` directory)
- **Required ADR sections**: §1 Status, §2 Context, §3 Decision Drivers, §4 Considered Options (full 11-axis × 9-framework scoring matrix with primary-source citations + tiered prose for top-4 / one-paragraph dismissal for bottom-5), §5 Current-Affairs RAG Sub-Decision, §7 Decision (definitive — pick a winner per the design above), §8 Consequences, §9 Exit Criteria
- **Primary-source citations required** for every framework in the scoring matrix (one per header, linking to official docs)
- **No code in the PR** — docs-only
- **Self-contained** — a future engineer should be able to read the ADR alone and understand both the framework choice AND the implementation patterns required to make it succeed

---

## 12. References

- Plan source: `C:\Users\ravik\.claude\plans\adr-content-engine-ai-framework.md`
- Existing IContentGenerator contract: `apps/content-engine/src/services/content-generator/types.ts`
- Existing PlaceholderContentGenerator: `apps/content-engine/src/services/content-generator/placeholder-generator.ts`
- DI / provider pattern: `apps/content-engine/src/services/content-generator/provider.ts`
- Worker boot: `apps/content-engine/src/worker.ts:114`
- Telemetry package: `packages/telemetry`
- Python reference (LangGraph + LangChain PoC): `D:\Work\restx-experimental\restx-experimental` — uses `MemorySaver` (in-memory checkpointing only, lost on restart)
