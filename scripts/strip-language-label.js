#!/usr/bin/env node
// allure-playwright unconditionally tags every result with a "language:
// javascript" label (no reporter option to turn it off). It's redundant
// noise on every test's detail page in our report, so strip it from the
// raw results before `allure generate` reads them.
const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2] ?? 'allure-results';
if (!fs.existsSync(resultsDir)) {
  console.log(`No results dir at ${resultsDir}, nothing to strip.`);
  process.exit(0);
}

const resultFiles = fs.readdirSync(resultsDir).filter((f) => f.endsWith('-result.json'));
let changed = 0;

for (const file of resultFiles) {
  const filePath = path.join(resultsDir, file);
  const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(result.labels)) continue;

  const before = result.labels.length;
  result.labels = result.labels.filter((label) => label.name !== 'language');
  if (result.labels.length !== before) {
    fs.writeFileSync(filePath, JSON.stringify(result));
    changed += 1;
  }
}

console.log(`Stripped the "language" label from ${changed} of ${resultFiles.length} result file(s).`);
