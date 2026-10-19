#!/usr/bin/env node
// Loads the dashboard history (runs.json) for the next publish, without ever silently starting from empty.
// Usage: node scripts/fetch-dashboard-history.js <live-url> <out.json> [backup.json]
//   1. the live site (3 tries)            -> used when it answers 200 with a JSON array
//   2. the backup copy (dashboard-data branch) -> used when the live site cannot be read
//   3. an empty history                   -> only when the live site answers 404 and no backup exists (the very first run)
//   Anything else fails the job, so a Pages hiccup can never wipe the history.
/* global fetch, AbortController, setTimeout, clearTimeout */
const fs = require('fs');

const [url, out, backup] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isHistory = (x) => Array.isArray(x);
const DELAYS = process.env.FETCH_DELAYS ? process.env.FETCH_DELAYS.split(',').map(Number) : [0, 3000, 8000];

async function live() {
  let notFound = false;
  for (const delay of DELAYS) {
    if (delay) await wait(delay);
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(`${url}?nocache=${Date.now()}`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (res.status === 404) { notFound = true; break; }
      if (res.ok) { const data = await res.json(); if (isHistory(data)) return { data, notFound }; console.error('Live history is not a JSON array.'); }
      else console.error(`Live history answered ${res.status}.`);
    } catch (e) { console.error(`Live history unreachable: ${e.message}`); }
  }
  return { data: null, notFound };
}

(async () => {
  const { data, notFound } = await live();
  if (data) { fs.writeFileSync(out, JSON.stringify(data)); console.log(`History loaded from the live site (${data.length} runs).`); return; }
  if (backup && fs.existsSync(backup)) {
    try { const b = JSON.parse(fs.readFileSync(backup, 'utf8')); if (isHistory(b)) { fs.writeFileSync(out, JSON.stringify(b)); console.log(`::warning::Live history unavailable, restored ${b.length} runs from the backup branch.`); return; } } catch { /* fall through */ }
  }
  if (notFound) { fs.writeFileSync(out, '[]'); console.log('No history exists yet (first run): starting with an empty one.'); return; }
  console.error('::error::Could not read the dashboard history from the live site or from the backup. Stopping so the history is not overwritten.');
  process.exit(1);
})();
