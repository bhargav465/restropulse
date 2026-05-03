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
