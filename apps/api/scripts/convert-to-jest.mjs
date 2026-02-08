import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const conversions = [
    // Import statement conversions
    [/from ['"]@jest\/globals['"]/g, "from 'vitest'"],
    [/import \{ jest \} from ['"]@jest\/globals['"];?/g, "import { vi } from 'vitest';"],

    // Function conversions
    [/\bjest\.fn\b/g, 'vi.fn'],
    [/\bjest\.spyOn\b/g, 'vi.spyOn'],
    [/\bjest\.clearAllMocks\b/g, 'vi.clearAllMocks'],
    [/\bjest\.resetAllMocks\b/g, 'vi.resetAllMocks'],
    [/\bjest\.restoreAllMocks\b/g, 'vi.restoreAllMocks'],
    [/\bjest\.unstable_mockModule\b/g, 'vi.mock'],
    [/\bjest\.unmock\b/g, 'vi.unmock'],
    [/\bjest\.useFakeTimers\b/g, 'vi.useFakeTimers'],
    [/\bjest\.useRealTimers\b/g, 'vi.useRealTimers'],
    [/\bjest\.advanceTimersByTimeAsync\b/g, 'vi.advanceTimersByTimeAsync'],
    [/\bjest\.advanceTimersByTime\b/g, 'vi.advanceTimersByTime'],
    [/\bjest\.runAllTimers\b/g, 'vi.runAllTimers'],
    [/\bjest\.runOnlyPendingTimers\b/g, 'vi.runOnlyPendingTimers'],

    // Test function naming
    [/\btest\(/g, 'it('],

    // Fix type annotations - remove <any> from vi.fn
    [/vi\.fn<any>\(\)/g, 'vi.fn()'],

    // Remove 'vi' from imports that already have it removed
    [/import \{([^}]*),\s*vi,/g, 'import {$1,'],
    [/import \{\s*vi,\s*([^}]*)\}/g, 'import { $1 }'],
];

function convertFile(filePath) {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;

    for (const [pattern, replacement] of conversions) {
        const newContent = content.replace(pattern, replacement);
        if (newContent !== content) {
            content = newContent;
            changed = true;
        }
    }

    if (changed) {
        writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Converted: ${filePath}`);
        return true;
    }
    return false;
}

function findTestFiles(dir, files = []) {
    const items = readdirSync(dir);

    for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            findTestFiles(fullPath, files);
        } else if (item.match(/\.(test|spec)\.(ts|js)$/)) {
            files.push(fullPath);
        }
    }

    return files;
}

const testFiles = findTestFiles('./tests');
let converted = 0;

for (const file of testFiles) {
    if (convertFile(file)) {
        converted++;
    }
}

console.log(`\n✨ Converted ${converted} test files to Vitest!`);
