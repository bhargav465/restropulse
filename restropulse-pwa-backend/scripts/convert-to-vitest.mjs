#!/usr/bin/env node
/**
 * Script to convert Jest test files to Vitest
 * Run with: node convert-to-vitest.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.join(__dirname, '../tests');

// Jest to Vitest replacements
const replacements = [
    // Imports
    { from: /import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest\/globals';/g, to: "import { describe, test, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';" },
    { from: /import { describe, test, expect, jest, beforeEach } from '@jest\/globals';/g, to: "import { describe, test, expect, vi, beforeEach } from 'vitest';" },
    { from: /import { describe, test, expect, beforeEach, jest } from '@jest\/globals';/g, to: "import { describe, test, expect, vi, beforeEach } from 'vitest';" },
    { from: /import { describe, it, expect, beforeEach, jest } from '@jest\/globals';/g, to: "import { describe, it, expect, vi, beforeEach } from 'vitest';" },
    { from: /import { jest } from '@jest\/globals';/g, to: "import { vi } from 'vitest';" },
    { from: /from '@jest\/globals'/g, to: "from 'vitest'" },

    // jest -> vi
    { from: /\bjest\.fn\b/g, to: 'vi.fn' },
    { from: /\bjest\.spyOn\b/g, to: 'vi.spyOn' },
    { from: /\bjest\.mock\b/g, to: 'vi.mock' },
    { from: /\bjest\.unmock\b/g, to: 'vi.unmock' },
    { from: /\bjest\.clearAllMocks\b/g, to: 'vi.clearAllMocks' },
    { from: /\bjest\.resetAllMocks\b/g, to: 'vi.resetAllMocks' },
    { from: /\bjest\.restoreAllMocks\b/g, to: 'vi.restoreAllMocks' },
    { from: /\bjest\.useFakeTimers\b/g, to: 'vi.useFakeTimers' },
    { from: /\bjest\.useRealTimers\b/g, to: 'vi.useRealTimers' },
    { from: /\bjest\.advanceTimersByTimeAsync\b/g, to: 'vi.advanceTimersByTimeAsync' },
    { from: /\bjest\.unstable_mockModule\b/g, to: 'vi.mock' },

    // Test aliases
    { from: /\btest\(/g, to: 'it(' },
    { from: /\btest\./g, to: 'it.' },
];

function convertFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;

    replacements.forEach(({ from, to }) => {
        const newContent = content.replace(from, to);
        if (newContent !== content) {
            changed = true;
            content = newContent;
        }
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Converted: ${path.relative(TESTS_DIR, filePath)}`);
        return true;
    }

    return false;
}

function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let convertedCount = 0;

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            convertedCount += scanDirectory(fullPath);
        } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
            if (convertFile(fullPath)) {
                convertedCount++;
            }
        }
    }

    return convertedCount;
}

console.log('🔄 Converting Jest tests to Vitest...\n');
const count = scanDirectory(TESTS_DIR);
console.log(`\n✨ Converted ${count} test files!`);
