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
