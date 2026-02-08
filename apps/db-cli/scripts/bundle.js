import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
    entryPoints: [join(__dirname, '../dist/index.js')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: join(__dirname, '../dist/bundle.cjs'),
    external: [],
    minify: true,
    sourcemap: false,
    banner: {
        js: '#!/usr/bin/env node',
    },
});

console.log('Bundle created: dist/bundle.cjs');
