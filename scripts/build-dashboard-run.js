#!/usr/bin/env node
// Collapses one or more Playwright JSON reporter files (one per CI matrix
// project) into a single run record for the QA dashboard.
// Usage: node scripts/build-dashboard-run.js <results-dir> <out.json>
// Run metadata comes from the GitHub Actions environment when present.
const fs = require('fs');
const path = require('path');
const { classify } = require('./lib/classify-failure');

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

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'); // terminal colour codes in error messages
const blank = () => ({ total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 });
const bump = (b, status) => {
  b.total++;
  if (status === 'expected') b.passed++;
  else if (status === 'unexpected') b.failed++;
  else if (status === 'flaky') b.flaky++;
  else b.skipped++;
};

const totals = blank();
const smoke = blank(); // tests tagged @smoke
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const severity = Object.fromEntries(SEVERITIES.map((k) => [k, blank()]));
const features = {};
const projects = {};
const flakyTests = [];
const failedTests = [];
const testMap = {}; // one row per spec, with a result per browser
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
      const isSmoke = (spec.tags ?? []).includes('smoke');
      const sev = SEVERITIES.find((k) => (spec.tags ?? []).includes(k)) ?? 'medium'; // untagged tests count as medium
      bump(totals, status);
      bump(severity[sev], status);
      if (isSmoke) bump(smoke, status);
      const f = (features[feature] ??= { ...blank(), smoke: blank() });
      bump(f, status);
      if (isSmoke) bump(f.smoke, status);
      bump((projects[t.projectName] ??= blank()), status);
      const row = (testMap[`${spec.file}::${spec.title}`] ??= { title: spec.title, feature, smoke: isSmoke, severity: sev, results: {} });
      row.results[t.projectName] = [status, t.results.reduce((n, r) => n + (r.duration ?? 0), 0)];
      const entry = { title: spec.title, file: spec.file, project: t.projectName, feature, severity: sev };
      if (status === 'flaky') {
        const first = t.results.find((r) => r.status !== 'passed' && r.status !== 'skipped');
        const err = (first?.error?.message ?? '').replace(ANSI, '');
        const { category, hint } = classify(err);
        flakyTests.push({ ...entry, retries: t.results.length - 1, error: err.split('\n')[0].slice(0, 240), category, hint });
      }
      if (status === 'unexpected') {
        const err = (t.results.at(-1)?.error?.message ?? '').replace(ANSI, '');
        const { category, cause, hint } = classify(err);
        failedTests.push({ ...entry, error: err.split('\n')[0].slice(0, 240), category, cause, hint });
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
  environment: env.TEST_ENV ?? '',
  scope: smoke.total === totals.total ? 'smoke' : 'full',
  ...totals,
  smoke,
  severity,
  durationMs,
  passRate: executed ? Math.round(((totals.passed + totals.flaky) / executed) * 1000) / 10 : 0,
  features,
  projects,
  flakyTests,
  failedTests,
  tests: Object.values(testMap),
};

fs.writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`Run ${run.runNumber}: ${totals.total} tests, ${run.passRate}% pass, ${totals.flaky} flaky, ${totals.failed} failed -> ${out}`);
