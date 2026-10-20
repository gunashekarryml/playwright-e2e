// Writes slack/worker/test-map.json: the tags of every test, so the Slack form can count and validate a selection.
// Re-run after adding or retagging tests:  node scripts/gen-test-map.js
const { execSync } = require('node:child_process');
const fs = require('node:fs');

const out = execSync('npx playwright test --list --reporter=json --project=chromium', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tests = [];
const walk = (suite) => {
  for (const s of suite.specs ?? []) tests.push([...(s.tags ?? [])].sort());
  for (const c of suite.suites ?? []) walk(c);
};
for (const s of JSON.parse(out).suites ?? []) walk(s);
fs.writeFileSync('slack/worker/test-map.json', `${JSON.stringify(tests)}\n`);
console.log(`${tests.length} tests -> slack/worker/test-map.json`);
