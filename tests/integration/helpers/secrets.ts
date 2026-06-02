import { config } from 'dotenv';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
export const INTEGRATION_ENV = process.env.INTEGRATION_ENV ?? 'dev';

config({ path: resolve(ROOT, `tests/integration/.env.integration.${INTEGRATION_ENV}`), override: false });
config({ path: resolve(ROOT, 'tests/integration/.env.integration'), override: false });

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
      `Set them in tests/integration/.env.integration or as CI environment variables.\n` +
      `See tests/integration/.env.integration.example for the full list.`,
    );
  }
  return Object.fromEntries(keys.map(k => [k, process.env[k]!])) as Record<K, string>;
}
