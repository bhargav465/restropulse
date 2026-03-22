#!/usr/bin/env node

// Reads lcov.info from each app's coverage/ directory and updates
// config/coverage-baseline.json if actual coverage exceeds the baseline.
// Only ratchets upward -- never lowers thresholds.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const baselinePath = path.join(repoRoot, 'config', 'coverage-baseline.json');
const appsDir = path.join(repoRoot, 'apps');

function parseLcovMetrics(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    let lf = 0, lh = 0, fnf = 0, fnh = 0, brf = 0, brh = 0;

    for (const line of lines) {
        if (line.startsWith('LF:')) lf += Number(line.slice(3)) || 0;
        if (line.startsWith('LH:')) lh += Number(line.slice(3)) || 0;
        if (line.startsWith('FNF:')) fnf += Number(line.slice(4)) || 0;
        if (line.startsWith('FNH:')) fnh += Number(line.slice(4)) || 0;
        if (line.startsWith('BRF:')) brf += Number(line.slice(4)) || 0;
        if (line.startsWith('BRH:')) brh += Number(line.slice(4)) || 0;
    }

    const toPct = (covered, total) => (total > 0 ? Math.floor((covered / total) * 100) : 100);

    return {
        lines: toPct(lh, lf),
        branches: toPct(brh, brf),
        functions: toPct(fnh, fnf),
    };
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
let updated = false;

const appDirs = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

for (const dir of appDirs) {
    const pkgPath = path.join(appsDir, dir.name, 'package.json');
    if (!existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const workspaceName = pkg.name;
    const lcovPath = path.join(appsDir, dir.name, 'coverage', 'lcov.info');

    if (!existsSync(lcovPath) || !baseline[workspaceName]) continue;

    const actual = parseLcovMetrics(lcovPath);
    const entry = baseline[workspaceName];

    for (const metric of ['lines', 'branches', 'functions']) {
        if (actual[metric] > entry[metric]) {
            console.log(`Ratchet ${workspaceName} ${metric}: ${entry[metric]}% -> ${actual[metric]}%`);
            entry[metric] = actual[metric];
            updated = true;
        }
    }
}

if (updated) {
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log('Coverage baseline updated.');
} else {
    console.log('No coverage improvements to ratchet.');
}
