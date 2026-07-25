# Multi-Environment Secrets: Streamlined Vault + Zero-Secret Web + Local Hybrid

- **Date:** 2026-07-25
- **Status:** Approved design; ready for implementation planning
- **Scope owner:** RestroPulse platform

## 1. Context & Problem

Investigation of the live Azure environment and the codebase revealed **three overlapping secrets mechanisms**, only one of which is actually in use:

1. **Azure App Service Key Vault References** (`@Microsoft.KeyVault(VaultName=restropulse-prod-kv;SecretName=STAGING-MONGODB-URI)`) — the mechanism **actually deployed**. The App Service managed identity resolves each reference at startup and injects a plain `process.env` value. The staging slot has 11 such reference settings; the prod slot has ~10.
2. **`packages/secrets` (`SECRETS_BACKEND=azure-kv`)** — a fully built, manifest-driven, in-app `DefaultAzureCredential` fetch path. **Completely unused** in both deployed slots (neither slot sets `SECRETS_BACKEND`, so it defaults to `env`). Verified end-to-end against the real vault (works), but never wired into the running environment.
3. **`feature/azure-zero-secrets` branch** (`loadAndValidateAzureEnv` + `/api/config/client`) — never merged; a cruder predecessor of #2 plus a web runtime-config idea. Not adopted.

Additional findings:

- **The vault is messy.** Inconsistent prefixes (`PROD-` *and* `PRODUCTION-`), redundant `META-APP-*` vs `INSTAGRAM-APP-*`, duplicate Firebase service-account entries, **no `dev-` set**, and **no AI/LLM keys at all** (`ANTHROPIC`, `FAL`, `REPLICATE`, `PERPLEXITY`, `GOOGLE-CALENDAR` are absent).
- **KV secret names are case-insensitive**, so `STAGING-MONGODB-URI` == `staging-mongodb-uri`. Only different *words* (e.g. `PROD-` vs `PRODUCTION-`) are distinct secrets.
- **The web app bakes `VITE_*` config into the bundle at build time** (`firebase.ts`, `index.tsx` read `import.meta.env.VITE_*`). CI already fetches 2 web secrets from KV (`{ENV}-WEB-GOOGLE-MAPS-API-KEY`, `{ENV}-WEB-APPINSIGHTS-CONNECTION-STRING`); the rest come from GitHub `vars.*`. The bundle is therefore environment-specific.
- **Prod is not live yet** — so vault renaming and reference repointing are low-risk now.

### Goals

1. A clean, documented **multi-environment** secrets scheme for **local / staging / prod**.
2. **Streamline** the vault: one canonical naming convention, dedupe legacy names, add the missing AI keys and `dev-` set.
3. **Zero-secret, environment-agnostic web bundle**: no `VITE_*` in the built artifact or CI plaintext.
4. A **local developer story** that needs no mandatory cloud dependency.

## 2. Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Vault topology | **Single shared vault** (`restropulse-prod-kv`) with `dev-`/`staging-`/`prod-` prefixes | No new infra; matches existing code + KV references; prod-not-live makes isolation less urgent |
| Canonical mechanism (deployed apps) | **App Service Key Vault References** | Native, already working, zero app code, no boot-time SDK latency |
| `packages/secrets` role | **Repurposed as the shared KV-fetch library** for `secrets:pull` + web `config.json` generation; **not** used at app boot | Reuse the provider + manifest without adding in-app credential/boot latency |
| Local dev | **Hybrid**: `.env` default (`SECRETS_BACKEND=env`), `npm run secrets:pull` opt-in to refresh from KV `dev-*` | No mandatory cloud dep; single source of truth on demand |
| Web config delivery | **Static `config.json` sidecar**, generated from KV at deploy time | Env-agnostic bundle; same-origin, fast, no API-up dependency; no CORS |

## 3. Architecture

### 3.1 Multi-environment scheme

One vault. Secret names are `{env}-{kebab}` where `env ∈ {dev, staging, prod}`. Three consumers select their environment independently:

| Environment | How secrets are read | Secret names | Identity |
|---|---|---|---|
| **local** | `npm run secrets:pull` writes `.env`; app runs `SECRETS_BACKEND=env` | `dev-*` | developer `az login` |
| **staging** | App Service KV-reference settings | `staging-*` | staging slot managed identity |
| **prod** (future) | App Service KV-reference settings | `prod-*` | prod slot managed identity |
| **web (per env)** | CI generates `config.json` from `{env}-*` web keys | `{env}-firebase-*`, `{env}-web-*` | CI OIDC identity |

`packages/secrets/manifest.ts` is the **single source of truth** for "which key, which app, which category, which KV name" and drives `secrets:pull`, the `config.json` generator, and the docs.

### 3.2 Manifest as key registry

`manifest.ts` is reconciled to reflect reality (see B2) and consumed by tooling only — never at app boot. `AzureKeyVaultSecretsProvider` becomes the shared fetch primitive for both scripts.

## 4. Workstreams (sequenced by reversibility)

### Workstream A — safe / additive (do first)

**A1. Web zero-secret `config.json` sidecar** (original task "(i)")
- New `ClientConfig` type in `@restropulse/shared` (`apiUrl`, `appUrl`, `firebase{…}`, `googleMapsApiKey`, `razorpayKeyId`, `appInsightsConnectionString`, `telemetrySampleRate`).
- New `apps/web/utils/client-config.ts`: `initClientConfig()` fetches same-origin `/config.json`; on failure (local dev) falls back to `import.meta.env.VITE_*`. `getClientConfig()` returns the resolved object and throws if used before init.
- `apps/web/firebase.ts`: stop initializing at import; export `initFirebase(cfg)` called after config resolves.
- `apps/web/index.tsx`: `await initClientConfig()` → init firebase + telemetry → render.
- Route the 3 direct `import.meta.env.VITE_API_URL` reads (`api.ts`/`utils/env.ts`, `Login.tsx`, `index.tsx`) through `getClientConfig().apiUrl`.
- CI `deploy-staging.yml`/`deploy-production.yml`: replace the `VITE_*` build env block with a step that generates `config.json` from KV (`{env}-*` web keys) and uploads it alongside the SPA. Generalizes the existing 2-secret KV fetch already present in these workflows.
- **Generator targets the real current vault names** (`staging-firebase-api-key`, `staging-web-google-maps-api-key`, …), independent of the B1 rename, and **must never emit `firebase-service-account-key`** (admin secret).
- Local dev unchanged: no `config.json` → fallback reads `apps/web/.env`.

**A2. Seed AI/LLM keys into the vault**
- Insert `{dev,staging}-anthropic-api-key`, `-fal-api-key`, `-replicate-api-token`, `-perplexity-api-key`, `-google-calendar-api-key` (prod added when live). Pure inserts; nothing depends on their prior absence except `CONTENT_GENERATOR_BACKEND=ai`, which they unblock.

**A3. `npm run secrets:pull`**
- Manifest-driven Node script (`scripts/secrets-pull.mjs`): for a chosen app (or all), fetch `dev-*` keys via `AzureKeyVaultSecretsProvider` (developer `az login`) and write/merge into `apps/*/.env`. Local runtime stays `SECRETS_BACKEND=env`.

### Workstream B — streamline (low-risk; prod not live)

**B1. Canonicalize vault naming**
- Standardize on `{env}-{kebab}`, `env ∈ {dev, staging, prod}`.
- Retire `PRODUCTION-*` (fold to `prod-*`).
- Retire `META-APP-*` (use `instagram-app-*`). Note: prod slot `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` reference legacy names — repoint those 2 references to `prod-instagram-app-*`.
- Dedupe the two Firebase service-account entries to a single `{env}-firebase-service-account-key`.
- Add the full `dev-*` set.

**B2. Reconcile `packages/secrets/manifest.ts`**
- Fix web key `kvName`s to the real names; ensure AI keys present; align every `kvName` to the canonical scheme. This registry drives A1/A3 and the docs.

**B3. Update provisioners + coupled workflow references**
- `scripts/provision-azure.sh` and `scripts/set-keyvault-secrets.sh`: emit canonical names.
- Keep in sync the only hardcoded workflow secret names: `{ENV}-WEB-GOOGLE-MAPS-API-KEY`, `{ENV}-WEB-APPINSIGHTS-CONNECTION-STRING` (superseded once A1's generator owns web config).
- Repoint the 2 prod-slot Instagram references (see B1).

**B4. `BK-rp-{dev,staging,prod}-admin`** — file-blob secrets (`file-encoding: utf-8`, created 2026-04-02), no app coupling. **Leave untouched**; flagged for the owner to identify.

### Workstream C — documentation
- Correct `docs/SECRETS.md`, `docs/INFRASTRUCTURE.md`, `docs/ARCHITECTURE.md`: the deployed mechanism is **App Service Key Vault References**, not in-app `packages/secrets`. Document the `{env}-` prefix scheme, `secrets:pull`, and the web `config.json` flow.

## 5. Risks & Dependencies

- **CI OIDC identity needs KV data-plane read** (`Key Vault Secrets User`) to generate `config.json` / fetch web secrets. Grant on the vault or the A1 CI step fails. (Deploy identity currently has RG Contributor, which is control-plane only.)
- **Never leak `firebase-service-account-key`** into `config.json`. The generator whitelists the public web subset explicitly.
- **First paint** waits on `/config.json`. It is same-origin static (~ms), but the boot path must handle fetch failure (fall back to `import.meta.env`, and never hard-block on a blank screen).
- **Web test churn** is minimized because the fallback reads `import.meta.env`; existing tests that set `VITE_*` keep working. Add focused unit tests for `client-config.ts` (fetch success, 404 fallback, get-before-init throw) and firebase/telemetry init ordering.
- **Two hardcoded workflow secret names** must stay in sync until A1's generator supersedes them.

## 6. Out of Scope (explicitly dropped)

- `/api/config/client` runtime endpoint (the azure-zero-secrets idea) — the static sidecar makes it redundant and avoids an API-up dependency at boot.
- Switching deployed apps to in-app `SECRETS_BACKEND=azure-kv` at boot — KV References already provide native azure-kv.
- Vault-per-environment / separate prod vault — single shared vault chosen.
- Merging or cherry-picking `feature/azure-zero-secrets`.

## 7. Testing

- **A1:** unit tests for `client-config.ts`; verify firebase/telemetry init only after config resolves; verify dev fallback. Coverage baseline honored (test the new file rather than excluding it).
- **A3:** dry-run `secrets:pull` against `dev-*` (values redacted) confirming `.env` is written for each app's manifest keys.
- **Streamline:** after B, a verification pass listing vault secrets confirms the canonical set and absence of retired names; confirm staging slot still boots (KV references resolve).

## 8. Open Items

- Identify `BK-rp-*-admin` (owner) before any future cleanup.
- Confirm the CI OIDC identity's KV role assignment (grant if missing) before A1 lands in CI.
