# ADR 0001: Content-Engine AI Framework + Current-Affairs RAG

## 1. Status

**Accepted** — 2026-05-03

This ADR is the first formal architecture decision record for the RestroPulse codebase. It is informed by the brainstorm spec at `docs/superpowers/specs/2026-05-03-content-engine-ai-framework-adr-design.md`.

## 2. Context

The content-engine (`apps/content-engine`) currently runs a `PlaceholderContentGenerator` — a non-AI, asset-catalog-based implementation of the `IContentGenerator` contract defined in `apps/content-engine/src/services/content-generator/types.ts`. The placeholder selects pre-existing media files from `assets/` and assembles captions from string templates. It exists to validate the surrounding pipeline (cron processors, post lifecycle, validation, publishing) before AI is wired in.

The next phase replaces the placeholder with a production AI-backed generator. The four operations on the contract (`draftCycle`, `reviseCycle`, `generatePost`, `revisePost`) must each:

- Compose multi-step external API calls in a single workflow: current-affairs/trends lookup → caption generation → image or video generation (and optionally user-image editing).
- Generate images and videos from scratch via AI APIs, not select from a static catalog.
- Modify user-provided images via image-to-image / inpainting where the post type calls for it.
- Tolerate long-running operations: video generation takes 30–120 seconds and must not block other content-engine cron processors.
- Track cost per `restaurantId` / `postId` for SaaS billing transparency.
- Route telemetry through the existing `@restropulse/telemetry` → Azure Monitor pipeline.

Two coupled decisions are required:

1. **Framework**: which TypeScript LLM/agent framework (or none) the AI generator is built on.
2. **Current-affairs RAG strategy**: how the generator obtains the time-sensitive context (holidays, sports outcomes, festivals, weather, trending hashtags) that the `currentAffairsHints: string[]` field on each operation already accepts.

This ADR captures both decisions, the implementation patterns required to make the chosen framework succeed (retry, durable polling, cost tracking), the pluggable architecture that preserves future flexibility (alternative providers, V3 brand-voice RAG, second business domain), and the explicit conditions under which to revisit.

## 3. Decision Drivers

The eight drivers below are listed in priority order. Each option in §4 is scored on how well it serves these drivers, weighted by the priority of the drivers it touches.

1. **Time-to-robust-product (P0)** — minimal cognitive load, idiomatic TypeScript, slides into the existing `IContentGenerator` interface without architectural changes.
2. **Cost (P0)** — per-call model selection (Haiku for cheap steps, Sonnet for reasoning), Anthropic prompt caching available, transparent token attribution per `restaurantId` / `postId`.
3. **Model portability (P1)** — swapping Anthropic, OpenAI, and Google must not require rewriting orchestration logic.
4. **Multi-modal orchestration (P1)** — text, image, and video API calls in one workflow, with optional user-image editing.
5. **Long-running operation tolerance (P1)** — video generation (30–120s) must not block other content-engine cron processors.
6. **Telemetry integration (P1)** — must emit OpenTelemetry spans into the existing `@restropulse/telemetry` → Azure Monitor pipeline; no proprietary observability lock-in.
7. **Per-customer cost attribution (P1)** — every LLM, image, and video API call must carry labels for `restaurantId`, `postId`, `cycleId`, `operation`, `model`, and `step`.
8. **Vendor lock-in posture (P2)** — escape hatch must be ≤200 LOC if the framework is abandoned.

## 4. Decision

Two coupled decisions, in scope for the same release:

### 4.1 Framework

**Adopt Vercel AI SDK (`ai` package + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` providers) as the LLM and tool-orchestration layer. Build a thin custom orchestrator (~200 LOC) inside `apps/content-engine/src/services/content-generator/ai-generator/` that implements `IContentGenerator` by composing typed async functions:**

```text
searchTrends() -> generateCaption() -> generateMedia() -> assemblePost()
```

No agent state-machine framework is adopted; orchestration stays plain TypeScript with typed Zod-validated boundaries.

### 4.2 Current-Affairs RAG

**Implement V1 (calendar/holiday injection) and V2 (daily Sonar Pro refresh + per-post hyperlocal triggers) in the initial release. Defer V3 (Atlas Vector Search for brand voice) until production evidence justifies it, per the rebuild triggers in §5.**

### 4.3 Implementation patterns scoped IN

These four patterns are mandatory implementation scope; the framework choice does not earn its keep without them:

1. **Retry helper** — `withRetry(fn, { maxAttempts, backoff: "exponential", retryOn: [TransientError, RateLimitError] })`. Profiles per surface: LLM (3 attempts, 1s/2s/4s backoff), image gen submission (3 attempts, 5s/10s/20s backoff), video gen submission (5 attempts, 10s/20s/40s/80s/160s backoff). Never retry on 4xx; always retry on 429/502/503/504.
2. **Durable video-generation polling** — new MongoDB `mediaJobs` collection; submission writes a row and returns immediately; new `mediaJobPoller` cron (every 30s) polls RUNNING jobs and resolves them; stale RUNNING jobs (>10 min) reset to PENDING. The `generatePost` worker never blocks for video gen.
3. **Crash-safe partial durability** — idempotent operations keyed on `jobId`; `generationStep` checkpoints on the post (`SEARCHING_TRENDS -> CAPTION_DONE -> MEDIA_REQUESTED -> MEDIA_DONE`); worker startup re-enqueues posts in non-terminal states older than 5 min from the last completed step. Explicitly **not** implementing exactly-once tool execution or time-travel debugging.
4. **Cost tracking + observability** — `withCostTracking(fn, { restaurantId, postId, cycleId, operation, model, step })` wrapper emits OTel metrics (`genai.tokens.input`, `genai.tokens.output`, `genai.cost.usd`, `genai.duration.ms`) and persists denormalized rows to a `cost_events` MongoDB collection. Two Azure Monitor Workbooks ship with the implementation: **Cost-by-restaurant** (stacked bar by API surface per restaurant per month) and **Per-post audit** (drill into any `postId` to see every API call's tokens, cost, and latency).

### 4.4 Image / video generation API

**Primary: `FalAIMediaGenerator` for image (Flux dev / Flux fill for editing) and video (Kling 1.6 / MiniMax) [^fal-ai].** Replicate is documented as the fallback and implemented as an `IMediaGenerator` alternative if fal.ai pricing or availability changes. Runway Gen-3 is deferred to a premium subscription tier and not built in the initial release.

### 4.5 Domain Specialization

**Adopt the `IDomainSpecialization` module described in §6.2. Ship `RestaurantSpecialization` as the only concrete implementation. Do not build registry, A/B prompt-testing, or cross-domain abstractions until a second domain is in flight.**

### 4.6 Rationale

Vercel AI SDK is the most mature TypeScript LLM library, gives provider neutrality at zero cost, has first-class structured output via Zod, supports Anthropic prompt caching natively, and emits OpenTelemetry spans that route into the existing `@restropulse/telemetry` and Azure Monitor pipeline without new infrastructure. The four `IContentGenerator` operations are bounded enough that a custom orchestrator is faster to write than learning an agent DSL, and remains easy to evolve toward Mastra or LangGraph if multi-agent patterns later emerge. Per-customer cost attribution via `withCostTracking` and durable video-generation polling via the `mediaJobs` collection cover the operational gaps that not-using-an-agent-framework leaves, in less than 800 LOC. The `IDomainSpecialization` seam keeps domain knowledge isolated so prompts can iterate without touching orchestration and a future second domain plugs in without core changes. The decision favors time-to-robust-product and cost over framework richness, matching the explicit P0 drivers.

[^fal-ai]: fal.ai documentation: <https://docs.fal.ai/>

## 5. Current-Affairs RAG Strategy

The `currentAffairsHints: string[]` field on each `IContentGenerator` operation accepts time-sensitive context that informs caption tone and thematic angles (festival tie-ins, sports outcomes, weather, regional cuisine trends). This section specifies how those strings are populated.

The strategy is **layered by data freshness vs cost vs value**, with three tiers and an explicit split between current-affairs RAG (real-time, no vector store) and brand-voice RAG (long-lived, vector store). Tiers V1 and V2 ship in the initial release; V3 is documented as a deferred future option with explicit rebuild triggers.

### 5.1 V1 — Calendar / holiday injection (in scope, ships first)

- **Source**: Google Calendar Public Holidays API, India calendar id `en.indian#holiday@group.v.calendar.google.com` [^gcal]
- **Cadence**: daily refresh job at 06:00 IST, cached in MongoDB for 24 hours
- **Injection content**: today's date / weekday / month / India holiday name (when within ±3 days)
- **Cost**: zero incremental
- **Estimated build**: 150–200 LOC, 2–3 days

### 5.2 V2 — Real-time current affairs (in scope, ships in same release as V1)

- **Source**: Perplexity Sonar Pro API as a unified current-affairs and trending-hashtags oracle [^sonar]
- **Cadence (two-tier)**:
  1. **Daily refresh** at 06:00 IST: one Sonar Pro call asking *"What are the major events, sports outcomes, festivals, weather events, and trending topics in India today and tomorrow that a restaurant might want to reference in social media content?"* — cached 24 hours, shared across all restaurants generating posts that day.
  2. **Per-post hyperlocal augmentation**: at `generatePost` time, when the `concept` field matches an allowlist of triggers (sports, festivals, weather, regional cuisine), make a targeted Sonar call for that specific angle.
- **Cost**: ~$0.10/day platform-wide for the daily refresh, plus ~$0.30–0.90/restaurant/month for per-post triggers (assuming a 20% trigger rate on 30 posts/month/restaurant)
- **Estimated build**: 300–500 LOC, 4–5 days

### 5.3 V3 — Brand-voice / restaurant-specific RAG (DEFERRED)

V3 is **not built** in the initial release. Its design and rebuild triggers are documented for the future engineer.

- **Triggers to build V3** (any one is sufficient):
  - Brand-voice complaints appear in ≥10% of revision-feedback `tags` over a rolling 30-day window
  - A multi-restaurant brand customer (≥3 restaurants under one brand) onboards
  - Restaurant retention analytics identify "AI-generated content doesn't sound like us" as a top-3 churn reason
- **What V3 would do**: embed past approved posts per restaurant; retrieve top-K most semantically similar approved posts during caption generation to maintain brand-voice consistency.
- **Primary backing store**: MongoDB Atlas Vector Search [^atlas-vector] (already running Atlas; no new infrastructure; available on the existing M10+ tier).
- **Vector store alternatives (documented but rejected for V3)**:
  - **pgvector** — would require Postgres alongside Mongo; operational overhead not justified
  - **sqlite-vec / LanceDB / hnswlib-node** — embedded options do not scale to multi-instance content-engine
  - **Pinecone** — paid SaaS, redundant with Atlas Vector
  - **Chroma** — workable but smaller community than Atlas Vector
- **Operational complexity V3 introduces** (and why it is deferred):
  - Embedding pipeline lifecycle (when does a post get embedded? on approval? on publish? backfill?)
  - Vector index versioning when prompts evolve
  - Cold-start problem for new restaurants
  - Quality evaluation: how to know whether retrieval is helping vs hurting
  - Cost overhead: embedding API calls plus vector storage plus retrieval queries
- **Estimated V3 build when triggered**: 7–10 days, plus ongoing operational cost.

### 5.4 RAG decision summary

| Tier | Scope | Build now? | Estimated cost / restaurant / month |
|---|---|---|---|
| V1 | Calendar / holiday injection | Yes | $0 |
| V2 | Daily Sonar refresh + per-post hyperlocal triggers | Yes | ~$0.30–1.00 |
| V3 | Atlas Vector Search for brand voice | No (deferred with explicit triggers) | n/a |

**Vector store decision**: not relevant to V1 or V2 (current affairs has a half-life of hours). Only relevant to V3, where MongoDB Atlas Vector Search is the primary candidate by infrastructure adjacency.

[^gcal]: Google Calendar API — Calendars resource: <https://developers.google.com/calendar/api/v3/reference/calendars>
[^sonar]: Perplexity Sonar API reference: <https://docs.perplexity.ai/api-reference/chat-completions>
[^atlas-vector]: MongoDB Atlas Vector Search documentation: <https://www.mongodb.com/docs/atlas/atlas-vector-search/>
