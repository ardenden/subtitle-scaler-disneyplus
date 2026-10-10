// Pre-flight checks for the extension package. No dependencies — run with:
//
//   node tools/check.mjs
//
// Catches the failures that actually happened during development: a temporary
// localhost match left in the manifest, and files referenced by the manifest
// that aren't in the repo.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/* ---------------------------------------------------------------- manifest */

let manifest;
try {
  // Strip a UTF-8 BOM if some editor added one — JSON.parse rejects it.
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
} catch (err) {
  console.error(`manifest.json does not parse: ${err.message}`);
  process.exit(1);
}

check(manifest.manifest_version === 3, 'manifest_version must be 3');
check(typeof manifest.name === 'string' && manifest.name.length > 0, 'name is missing');
check(/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(manifest.version), `bad version: ${manifest.version}`);
check(
  typeof manifest.description === 'string' && manifest.description.length <= 132,
  'description missing, or longer than the store’s 132 character limit'
);

/* -------------------------------------------- no stray development matches */

// The local test pages need a temporary http://localhost match. Shipping it
// would inject the content script into every dev server a user runs.
const patterns = [
  ...(manifest.host_permissions ?? []),
  ...(manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []),
  ...(manifest.web_accessible_resources ?? []).flatMap((war) => war.matches ?? []),
];
for (const pattern of patterns) {
  check(
    /^https:\/\/(\*\.)?disneyplus\.com\/\*$/.test(pattern),
    `unexpected match pattern in manifest: ${pattern}`
  );
}
check(patterns.length > 0, 'no match patterns declared');

/* ------------------------------------------- referenced files must be real */

const referenced = [
  ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
  ...(manifest.web_accessible_resources ?? []).flatMap((war) => war.resources ?? []),
  ...(manifest.action?.default_popup ? [manifest.action.default_popup] : []),
  ...Object.values(manifest.icons ?? {}),
];
for (const rel of referenced) {
  check(existsSync(join(root, rel)), `manifest references a missing file: ${rel}`);
}

/* ------------------------------------------------------- javascript parses */

const scripts = referenced.filter((f) => f.endsWith('.js'));
scripts.push('src/popup.js'); // loaded by popup.html, not named in the manifest
for (const rel of new Set(scripts)) {
  if (!existsSync(join(root, rel))) continue;
  try {
    execFileSync(process.execPath, ['--check', join(root, rel)], { stdio: 'pipe' });
  } catch (err) {
    check(false, `${rel} has a syntax error:\n${err.stderr?.toString().trim()}`);
  }
}

/* ------------------------------------------------------------------ report */

if (failures.length) {
  console.error(`✗ ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`✓ ${manifest.name} ${manifest.version} — manifest, files and scripts all check out`);
