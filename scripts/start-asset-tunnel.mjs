#!/usr/bin/env node

/**
 * Configure the content-engine asset server URL for local publishing tests.
 *
 * Requires NGROK_DOMAIN to be set (the same domain used by the webhook tunnel).
 * The API mounts a /dev-assets reverse proxy in development, so a second ngrok
 * tunnel is not needed — asset requests are routed through the existing tunnel:
 *
 *   Facebook CDN  →  https://<NGROK_DOMAIN>/dev-assets/images/foo.jpg
 *                →  ngrok → API :3001 → /dev-assets proxy → asset server :3002
 *
 * Writes ASSET_SERVER_BASE_URL to apps/content-engine/.env.
 * tsx --watch on .env auto-restarts the content-engine to pick it up.
 *
 * Usage:
 *   npm run ngrok:assets
 *   node scripts/start-asset-tunnel.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

function log(tag, msg) {
    const labels = { ok: '[OK]', warn: '[WARN]', info: '[INFO]', fail: '[FAIL]' };
    console.log(`  ${labels[tag] ?? tag}  ${msg}`);
}

function loadRootEnv() {
    const envPath = join(WORKSPACE_ROOT, '.env');
    if (!existsSync(envPath)) return;
    for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) process.env[key] = val;
    }
}

function writeAssetUrl(publicUrl) {
    const envPath = join(WORKSPACE_ROOT, 'apps', 'content-engine', '.env');
    let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    if (/^ASSET_SERVER_BASE_URL\s*=/m.test(content)) {
        content = content.replace(/^ASSET_SERVER_BASE_URL\s*=.*/m, `ASSET_SERVER_BASE_URL=${publicUrl}`);
    } else {
        content = content.trimEnd() + `\nASSET_SERVER_BASE_URL=${publicUrl}\n`;
    }
    writeFileSync(envPath, content, 'utf8');
    log('ok', `apps/content-engine/.env  →  ASSET_SERVER_BASE_URL=${publicUrl}`);
}

// ---------------------------------------------------------------------------

loadRootEnv();

const domain = process.env.NGROK_DOMAIN;

if (!domain) {
    log('fail', 'NGROK_DOMAIN is not set in root .env.');
    log('info', 'The asset tunnel shares the webhook tunnel domain.');
    log('info', 'Add NGROK_DOMAIN to your root .env (same token as the webhook tunnel).');
    process.exit(1);
}

const assetUrl = `https://${domain}/dev-assets`;

console.log('');
log('info', `Webhook domain: ${domain}`);
log('info', 'Routing asset requests through /dev-assets on the existing tunnel.');
writeAssetUrl(assetUrl);
log('ok', `Asset URL: ${assetUrl}`);
console.log('');

// Stay running so mprocs shows this proc as active with the URL visible.
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 60_000);
