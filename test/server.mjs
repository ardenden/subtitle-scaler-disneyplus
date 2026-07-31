// Serves native-track.html on every path, so the URL can include /watch and
// satisfy the extension's onWatchPage() gate.
//
//   node test/server.mjs   ->   http://localhost:8787/watch
//
// Requires a temporary content_scripts match for http://localhost:8787/*
// in manifest.json. See test/README.md.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;

createServer(async (_req, res) => {
  try {
    const html = await readFile(join(dir, 'native-track.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err));
  }
}).listen(PORT, () => {
  console.log(`native <track> test page: http://localhost:${PORT}/watch`);
});
