#!/usr/bin/env node
// Prepends a run record to the dashboard's history file (newest first, capped).
// Usage: node scripts/update-dashboard-history.js <run.json> <runs.json>
const fs = require('fs');

const [runPath, historyPath] = process.argv.slice(2);
const MAX_RUNS = 60;

const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
let history = [];
if (fs.existsSync(historyPath)) {
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch { history = []; }
}
history = [run, ...history.filter((r) => r.id !== run.id)].slice(0, MAX_RUNS);
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log(`History now holds ${history.length} runs.`);
