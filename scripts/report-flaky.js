#!/usr/bin/env node
// Scans a Playwright JSON reporter file for tests that only passed after a
// retry, and surfaces them in the GitHub Actions job summary so flakiness
// is visible instead of silently disappearing behind CI's retry count.
const fs = require('fs');

function collectSpecs(suite, specs = []) {
  for (const spec of suite.specs ?? []) specs.push(spec);
  for (const child of suite.suites ?? []) collectSpecs(child, specs);
  return specs;
}

const resultsPath = process.argv[2] ?? 'test-results/results.json';
if (!fs.existsSync(resultsPath)) {
  console.log(`No results file found at ${resultsPath}, skipping flaky report.`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const specs = (data.suites ?? []).flatMap((suite) => collectSpecs(suite));

const flaky = [];
for (const spec of specs) {
  for (const t of spec.tests ?? []) {
    if (t.status === 'flaky') {
      flaky.push({
        title: `${spec.file} › ${spec.title}`,
        project: t.projectName,
        retries: t.results.length - 1,
      });
    }
  }
}

const lines = [];
if (flaky.length === 0) {
  lines.push('No flaky tests detected in this run.');
} else {
  lines.push('### ⚠️ Flaky tests detected');
  lines.push('');
  lines.push('| Test | Project | Retries needed |');
  lines.push('|---|---|---|');
  for (const f of flaky) {
    lines.push(`| ${f.title} | ${f.project} | ${f.retries} |`);
  }
}

const summary = lines.join('\n');
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
