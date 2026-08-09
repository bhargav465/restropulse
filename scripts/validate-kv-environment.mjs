#!/usr/bin/env node

/**
 * Exhaustive AKV-backed validation for an environment.
 *
 * Checks:
 *  1) Required Key Vault secrets exist for all manifest-required keys.
 *  2) Full integration suite runs in kv:<env> mode.
 *
 * Usage:
 *   node scripts/validate-kv-environment.mjs dev
 *   node scripts/validate-kv-environment.mjs staging
 *   node scripts/validate-kv-environment.mjs prod
 */

import { execSync } from 'node:child_process';
import { SECRETS_MANIFEST } from '@restropulse/secrets';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const rawEnv = (process.argv[2] ?? 'dev').toLowerCase();
const envMap = {
  dev: { prefix: 'dev', mode: 'kv:dev' },
  staging: { prefix: 'staging', mode: 'kv:staging' },
  prod: { prefix: 'prod', mode: 'kv:prod' },
  production: { prefix: 'prod', mode: 'kv:prod' },
};

if (!envMap[rawEnv]) {
  console.error(`Unknown env "${rawEnv}". Use one of: dev, staging, prod.`);
  process.exit(1);
}

const { prefix, mode } = envMap[rawEnv];
const vaultUrl = process.env.AZURE_KEY_VAULT_URL ?? 'https://restropulse-prod-kv.vault.azure.net';

async function validateRequiredSecrets() {
  const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  const required = SECRETS_MANIFEST
    .filter((d) => d.required && d.kvName)
    .map((d) => ({ key: d.key, secretName: `${prefix}-${d.kvName}` }));

  const missing = [];

  for (const def of required) {
    try {
      const secret = await client.getSecret(def.secretName);
      if (!secret.value) {
        missing.push(def);
      }
    } catch (err) {
      if (err?.code === 'SecretNotFound' || err?.statusCode === 404) {
        missing.push(def);
      } else {
        throw err;
      }
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required AKV secrets for ${rawEnv}:`);
    for (const m of missing) {
      console.error(`  - ${m.secretName} (${m.key})`);
    }
    process.exit(1);
  }

  console.log(`Required AKV secrets check passed for ${rawEnv} (${required.length} keys).`);
}

function runIntegrationSuite() {
  console.log(`Running full integration suite in mode ${mode} ...`);
  execSync(`npm run test:integration:${mode}`, {
    stdio: 'inherit',
    env: { ...process.env, AZURE_KEY_VAULT_URL: vaultUrl },
  });
}

await validateRequiredSecrets();
runIntegrationSuite();

