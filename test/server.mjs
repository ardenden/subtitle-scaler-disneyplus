// Test pages for the extension. Every path ends in /watch so the URL satisfies
// onWatchPage(), which otherwise gates the whole sweep off.
//
//   node test/server.mjs
//     http://localhost:8787/watch          screenshot rig (DOM caption path)
//     http://localhost:8787/native/watch   native <track> path
//
// Requires a temporary content_scripts match for http://localhost:8787/*
// in manifest.json. See test/README.md.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;

createServer(async (req, res) => {
  try {
    const page = req.url.includes('/native') ? 'native-track.html' : 'screenshot-rig.html';
    const html = await readFile(join(dir, page));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err));
  }
}).listen(PORT, () => {
  console.log(`screenshot rig:  http://localhost:${PORT}/watch`);
  console.log(`native <track>:  http://localhost:${PORT}/native/watch`);
});
