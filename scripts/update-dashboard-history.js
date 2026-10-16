#!/usr/bin/env node
// Prepends a run record to the dashboard's history file (newest first, capped).
// Usage: node scripts/update-dashboard-history.js <run.json> <runs.json>
const fs = require('fs');

const [runPath, historyPath] = process.argv.slice(2);
const MAX_RUNS = 120;
const KEEP_TESTS = 3; // per environment

const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
let history = [];
if (fs.existsSync(historyPath)) {
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch { history = []; }
}
// Unnamed runs (push / nightly) are QA runs. Matches envOf() in dashboard/index.html.
const envOf = (r) => (!r.environment || r.environment === 'Default' ? 'QA' : r.environment);
const seen = {};
history = [run, ...history.filter((r) => r.id !== run.id)].slice(0, MAX_RUNS)
  .map((r) => { // per-test detail only for the newest few runs of each environment
    const e = envOf(r);
    seen[e] = (seen[e] ?? 0) + 1;
    return seen[e] <= KEEP_TESTS || !r.tests ? r : { ...r, tests: undefined };
  });
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log(`History now holds ${history.length} runs.`);
