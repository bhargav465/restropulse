/**
 * Run a local MongoDB for development without installing MongoDB.
 *
 * mongodb-memory-server is already a devDependency (the test suites use it).
 * It downloads a real mongod binary into a user-local cache, so this needs
 * neither Homebrew nor sudo -- useful on machines where the developer does
 * not have admin rights.
 *
 * Unlike the test usage, this pins the port to 27017 and passes a dbPath, so
 * the data survives restarts and matches the MONGODB_URI already in
 * apps/*.env. Seed once, not on every boot.
 *
 * Usage:  node scripts/dev-mongo.mjs      (leave running in its own terminal)
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(repoRoot, '.mongo-data');
const PORT = 27017;

// Pinned for determinism: left unset, mongodb-memory-server tracks the newest
// release, so a new upstream version can change what gets downloaded without
// anything here changing. Override with MONGO_VERSION if this one has no build
// for your platform: https://www.mongodb.com/download-center/community/releases/archive
const VERSION = process.env.MONGO_VERSION || '8.0.4';

mkdirSync(dbPath, { recursive: true });

console.log('Starting mongod ' + VERSION + ' on port ' + PORT + ' ...');
console.log('First run downloads the mongod binary (~100MB) and may take a few minutes.');

let server;
try {
    server = await MongoMemoryServer.create({
        binary: { version: VERSION },
        instance: { port: PORT, dbPath, storageEngine: 'wiredTiger' },
    });
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('EADDRINUSE') || message.includes('address already in use')) {
        console.error('\nPort ' + PORT + ' is already in use.');
        console.error('Something is already listening there -- possibly another copy of this script.');
        console.error('Find it with:  lsof -i :' + PORT);
        process.exit(1);
    }

    // fastdl.mongodb.org returns 403 both when the version/platform pair has no
    // build and when an outbound proxy blocks the host, so name both causes --
    // the status code alone does not distinguish them.
    if (message.includes('Download failed') || message.includes('403')) {
        console.error('\nCould not download mongod ' + VERSION + ' from fastdl.mongodb.org.');
        console.error('Either there is no build for this version/platform, or the host is blocked.');
        console.error('Check reachability:');
        console.error('  curl -sS -o /dev/null -w "%{http_code}\\n" -I https://fastdl.mongodb.org/');
        console.error('If reachable, try another version from the release archive:');
        console.error('  MONGO_VERSION=7.0.14 node scripts/dev-mongo.mjs');
        console.error('  https://www.mongodb.com/download-center/community/releases/archive');
        process.exit(1);
    }

    console.error('\nFailed to start mongod: ' + message);
    process.exit(1);
}

console.log('\nMongoDB is running.');
console.log('  URI  : ' + server.getUri());
console.log('  Data : ' + dbPath);
console.log('\nLeave this terminal open. Press Ctrl+C to stop.');

const shutdown = async () => {
    console.log('\nStopping mongod ...');
    await server.stop();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
