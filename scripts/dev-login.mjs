#!/usr/bin/env node

/**
 * Development login helper.
 *
 * Drives the fallback OTP endpoints (apps/api/src/routes/auth.ts) end to end and
 * prints a ready-to-paste browser console snippet that seeds localStorage with a
 * valid session, so you can reach the dashboard without going through the
 * Firebase phone-auth UI.
 *
 * The API only returns `devOtp` from /auth/send-otp when NODE_ENV is not
 * "production", so this script is inert against a production deployment.
 *
 * Usage:
 *   npm run dev:login                        # seeded owner, default API port
 *   npm run dev:login -- +919876543211       # a different phone number
 *   npm run dev:login -- --api http://localhost:3001
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEEDED_OWNER_PHONE = '+919999999999';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function getApiPort() {
    try {
        const raw = readFileSync(resolve(process.cwd(), 'config', 'ports.json'), 'utf8');
        const port = Number.parseInt(String(JSON.parse(raw).api), 10);
        if (Number.isInteger(port) && port > 0) return port;
    } catch {
    }

    return 3001;
}

function parseArgs() {
    const args = process.argv.slice(2);

    let apiBase = null;
    const positional = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--api') {
            apiBase = args[++i];
        } else if (args[i].startsWith('--api=')) {
            apiBase = args[i].slice('--api='.length);
        } else {
            positional.push(args[i]);
        }
    }

    return {
        apiBase: (apiBase || `http://localhost:${getApiPort()}`).replace(/\/+$/, ''),
        phone: normalizePhone(positional[0] || SEEDED_OWNER_PHONE),
    };
}

/** Accept "9999999999", "+91 99999 99999", "+919999999999". */
function normalizePhone(input) {
    const digits = input.replace(/[^\d]/g, '');
    const local = digits.startsWith('91') && digits.length > 10 ? digits.slice(-10) : digits;
    return `+91${local}`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function log(tag, msg) {
    const labels = { ok: '[OK]  ', info: '[INFO]', step: '[STEP]', fail: '[FAIL]' };
    console.log(`  ${labels[tag] ?? tag}  ${msg}`);
}

function die(msg, hint) {
    console.log('');
    log('fail', msg);
    if (hint) console.log(`\n  ${hint}`);
    console.log('');
    process.exit(1);
}

/**
 * POST JSON and return the parsed body. Distinguishes the failure modes that
 * actually happen in local dev: API down, HTML/error page instead of JSON, and
 * a well-formed error response.
 */
async function postJson(url, body) {
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (err) {
        die(
            `Cannot reach the API at ${url}`,
            'Is it running? Check the api pane, then: curl -i -sS ' +
            new URL(url).origin + '/health\n  A boot failure is usually a missing env var or the Atlas IP allowlist.',
        );
    }

    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        die(
            `Expected JSON from ${url} but got ${response.status} ${response.statusText}`,
            `First 200 characters of the response:\n  ${text.slice(0, 200)}`,
        );
    }

    return { status: response.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { apiBase, phone } = parseArgs();

console.log('\n  RestroPulse -- Dev Login\n');
log('info', `API   : ${apiBase}`);
log('info', `Phone : ${phone}`);
console.log('');

log('step', 'Requesting OTP...');
const sent = await postJson(`${apiBase}/api/auth/send-otp`, { phone });

if (!sent.body.success) {
    die(
        `send-otp failed (${sent.status}): ${sent.body.message ?? 'no message'}`,
        'A 400 here means the phone number failed validation (+91 followed by 10 digits).',
    );
}

const devOtp = sent.body.devOtp;
if (!devOtp) {
    die(
        'The API did not return devOtp',
        'devOtp is only included when NODE_ENV is not "production".\n' +
        '  Set NODE_ENV=development in apps/api/.env and restart the API.',
    );
}
log('ok', 'OTP received');

log('step', 'Verifying OTP...');
const verified = await postJson(`${apiBase}/api/auth/verify-otp`, { phone, otp: devOtp });

if (!verified.body.success) {
    die(
        `verify-otp failed (${verified.status}): ${verified.body.message ?? 'no message'}`,
        'If this says the OTP expired or was not found, the API is writing and reading\n' +
        '  different databases -- check MONGODB_DB_NAME in apps/api/.env.',
    );
}

const { token, refreshToken, user } = verified.body;
const restaurantId = verified.body.restaurantId || user?.restaurantId || '';

log('ok', `Signed in as ${user?.name ?? 'unknown user'} (${user?.role ?? 'no role'})`);

if (!restaurantId) {
    console.log('');
    log('info', 'This user has no restaurantId, so the app will open onboarding rather');
    log('info', 'than the dashboard. That means the user was auto-created on first login');
    log('info', `instead of matching a seeded record. Confirm the seed ran into the same`);
    log('info', 'database the API reads (MONGODB_DB_NAME must match apps/db-cli/.env).');
} else {
    log('ok', `Restaurant: ${restaurantId}`);
}

const target = restaurantId ? '/?view=dashboard' : '/?view=onboarding';

console.log(`
  Paste this into the BROWSER console (DevTools) with the app open.
  It will not work in a terminal -- localStorage only exists in the browser.

------------------------------------------------------------------------
localStorage.setItem('rp_token', '${token}');
localStorage.setItem('rp_refresh_token', '${refreshToken ?? ''}');
localStorage.setItem('rp_restaurant_id', '${restaurantId}');
localStorage.setItem('rp_session', 'true');
location.href = '${target}';
------------------------------------------------------------------------
`);
