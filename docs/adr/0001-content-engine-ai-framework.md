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
