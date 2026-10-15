#!/usr/bin/env node
// Collapses one or more Playwright JSON reporter files (one per CI matrix
// project) into a single run record for the QA dashboard.
// Usage: node scripts/build-dashboard-run.js <results-dir> <out.json>
// Run metadata comes from the GitHub Actions environment when present.
const fs = require('fs');
const path = require('path');

const [dir = 'dashboard-input', out = 'run.json'] = process.argv.slice(2);

function findJson(d, files = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) findJson(p, files);
    else if (e.name === 'results.json') files.push(p);
  }
  return files;
}

function collectSpecs(suite, specs = []) {
  for (const s of suite.specs ?? []) specs.push(s);
  for (const c of suite.suites ?? []) collectSpecs(c, specs);
  return specs;
}

const blank = () => ({ total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 });
const bump = (b, status) => {
  b.total++;
  if (status === 'expected') b.passed++;
  else if (status === 'unexpected') b.failed++;
  else if (status === 'flaky') b.flaky++;
  else b.skipped++;
};

const totals = blank();
const features = {};
const projects = {};
const flakyTests = [];
const failedTests = [];
let durationMs = 0;
let startTime = null;

for (const file of findJson(dir)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  durationMs = Math.max(durationMs, data.stats?.duration ?? 0); // matrix jobs run in parallel
  startTime = startTime ?? data.stats?.startTime;
  for (const spec of (data.suites ?? []).flatMap((s) => collectSpecs(s))) {
    const feature = path.basename(spec.file).replace(/\.spec\.ts$/, '');
    for (const t of spec.tests ?? []) {
      const status = t.status; // expected | unexpected | flaky | skipped
      bump(totals, status);
      bump((features[feature] ??= blank()), status);
      bump((projects[t.projectName] ??= blank()), status);
      const entry = { title: spec.title, file: spec.file, project: t.projectName, feature };
      if (status === 'flaky') flakyTests.push({ ...entry, retries: t.results.length - 1 });
      if (status === 'unexpected') {
        const err = t.results.at(-1)?.error?.message ?? '';
        failedTests.push({ ...entry, error: err.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 240) });
      }
    }
  }
}

const executed = totals.total - totals.skipped;
const env = process.env;
const run = {
  id: env.GITHUB_RUN_ID ?? String(Date.now()),
  runNumber: Number(env.GITHUB_RUN_NUMBER ?? 0),
  date: startTime ?? new Date().toISOString(),
  event: env.GITHUB_EVENT_NAME ?? 'local',
  branch: env.GITHUB_REF_NAME ?? 'local',
  sha: (env.GITHUB_SHA ?? '').slice(0, 7),
  runUrl: env.GITHUB_SERVER_URL ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '',
  baseUrl: env.BASE_URL ?? '',
  ...totals,
  durationMs,
  passRate: executed ? Math.round(((totals.passed + totals.flaky) / executed) * 1000) / 10 : 0,
  features,
  projects,
  flakyTests,
  failedTests,
};

fs.writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`Run ${run.runNumber}: ${totals.total} tests, ${run.passRate}% pass, ${totals.flaky} flaky, ${totals.failed} failed -> ${out}`);
