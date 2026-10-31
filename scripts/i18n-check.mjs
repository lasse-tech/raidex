// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// i18n-check: every dictionary pair (en.json, de.json) has the same keys, no
// empty values and the same {{placeholders}} per key.
// Usage: node scripts/i18n-check.mjs <dir with en.json and de.json>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function flatten(node, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const vars = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');

let failed = false;
const fail = (msg) => { console.error(msg); failed = true; };

for (const dir of process.argv.slice(2)) {
  const read = (lang) => flatten(JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')), '', new Map());
  const en = read('en');
  const de = read('de');
  for (const [k, v] of en) {
    if (typeof v !== 'string' || v === '') fail(`${dir}: en ${k}: empty or not a string`);
    if (!de.has(k)) fail(`${dir}: de lacks ${k}`);
    else if (vars(v) !== vars(de.get(k))) fail(`${dir}: ${k}: placeholders differ`);
  }
  for (const [k, v] of de) {
    if (typeof v !== 'string' || v === '') fail(`${dir}: de ${k}: empty or not a string`);
    if (!en.has(k)) fail(`${dir}: en lacks ${k}`);
  }
  if (!failed) console.log(`${dir}: ${en.size} keys, en and de match`);
}
process.exit(failed ? 1 : 0);
