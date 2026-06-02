import { config } from 'dotenv';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
export const INTEGRATION_ENV = process.env.INTEGRATION_ENV ?? 'dev';

// Priority order (highest first, override: false means earlier values win):
// 1. CI environment variables already in process.env
// 2. tests/integration/.env.integration.{env}  (environment-specific overrides)
// 3. tests/integration/.env.integration         (shared integration secrets)
// 4. apps/content-engine/.env                   (AI backend keys)
// 5. apps/api/.env                              (auth, payments, Meta keys)
// 6. apps/publisher/.env                        (encryption, Instagram keys)
config({ path: resolve(ROOT, `tests/integration/.env.integration.${INTEGRATION_ENV}`), override: false });
config({ path: resolve(ROOT, 'tests/integration/.env.integration'), override: false });
config({ path: resolve(ROOT, 'apps/content-engine/.env'), override: false });
config({ path: resolve(ROOT, 'apps/api/.env'), override: false });
config({ path: resolve(ROOT, 'apps/publisher/.env'), override: false });

/**
 * Returns the secrets map or throws if any required key is absent.
 * No skip/ignore mechanism -- integration tests are always a deliberate manual run.
 */
export function requireSecrets<K extends string>(
  suiteName: string,
  keys: K[],
): Record<K, string> {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[integration] Suite "${suiteName}" is missing required secrets: ${missing.join(', ')}.\n` +
      `Set them in the relevant apps/*.env file, tests/integration/.env.integration, or as CI environment variables.\n` +
      `See tests/integration/.env.integration.example for the full list.`,
    );
  }
  return Object.fromEntries(keys.map(k => [k, process.env[k]!])) as Record<K, string>;
}
