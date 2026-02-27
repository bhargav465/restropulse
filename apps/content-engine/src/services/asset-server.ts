/**
 * Local Asset HTTP Server
 *
 * Serves the locally downloaded placeholder images and videos over HTTP
 * so that the publishing service (and any other consumer) can access them
 * by URL. Uses only Node.js built-in modules — no extra dependencies.
 *
 * Assets are served from the assets/ directory at the project root:
 *   GET /images/<filename>  → assets/images/<filename>
 *   GET /videos/<filename>  → assets/videos/<filename>
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve assets/ relative to this file so it works for both
// `tsx` (src/services/) and compiled output (dist/services/).
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets');

const MIME_TYPES: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

export function startAssetServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    // Sanitize path to prevent directory traversal
    const safePath = path.normalize(req.url ?? '/').replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(ASSETS_DIR, safePath);

    // Ensure the resolved path stays within ASSETS_DIR
    if (!filePath.startsWith(ASSETS_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Asset not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.listen(port, () => {
    console.log(`[Asset Server] Serving local assets at http://localhost:${port}`);
  });

  return server;
}
