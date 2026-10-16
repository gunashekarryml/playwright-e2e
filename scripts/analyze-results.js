#!/usr/bin/env node
// Rule-based analysis of a Playwright JSON reporter file. Counts
// passed/failed/skipped/flaky and classifies each failure by its error text,
// so the cause is visible without reading every log. No LLM involved.
// Usage: node scripts/analyze-results.js [results.json] [analysis.json]
const fs = require('fs');

const { classify } = require('./lib/classify-failure');

const strip = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '');

function collectSpecs(suite, out = []) {
  out.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) collectSpecs(child, out);
  return out;
}

const resultsPath = process.argv[2] ?? 'test-results/results.json';
const outPath = process.argv[3] ?? 'test-results/analysis.json';
if (!fs.existsSync(resultsPath)) {
  console.log(`No results file at ${resultsPath}, skipping analysis.`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const specs = (data.suites ?? []).flatMap((s) => collectSpecs(s));

const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
const failures = [];
const flaky = [];
const byProjectFailures = {};

for (const spec of specs) {
  for (const t of spec.tests ?? []) {
    const status = t.status === 'expected' ? 'passed' : t.status === 'unexpected' ? 'failed' : t.status;
    if (status in counts) counts[status]++;
    if (status !== 'failed' && status !== 'flaky') continue;

    const failedRuns = t.results.filter((r) => r.status !== 'passed' && r.status !== 'skipped');
    const message = strip(failedRuns.at(-1)?.error?.message ?? failedRuns.at(-1)?.errors?.[0]?.message ?? '');
    const { category, hint } = classify(message);
    const entry = {
      test: `${spec.file} › ${spec.title}`,
      project: t.projectName,
      category,
      hint,
      attempts: t.results.length,
      error: message.split('\n')[0].slice(0, 200),
    };
    if (status === 'flaky') flaky.push(entry);
    else {
      failures.push(entry);
      (byProjectFailures[spec.title] ??= new Set()).add(t.projectName);
    }
  }
}

// A failure on only some browser projects points to a browser-specific issue.
const allProjects = new Set(specs.flatMap((s) => (s.tests ?? []).map((t) => t.projectName)));
for (const f of failures) {
  const failedOn = byProjectFailures[f.test.split(' › ')[1]];
  if (allProjects.size > 1 && failedOn.size < allProjects.size) {
    f.note = `Fails only on: ${[...failedOn].join(', ')} (browser-specific)`;
  } else if (allProjects.size > 1) {
    f.note = 'Fails on every project (likely app or test logic)';
  }
}

const byCategory = {};
for (const f of failures) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const analysis = { total, counts, byCategory, failures, flaky };
fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2));

const lines = ['### Test result analysis', '', `Total ${total} | ✅ ${counts.passed} passed | ❌ ${counts.failed} failed | ⚠️ ${counts.flaky} flaky | ⏭️ ${counts.skipped} skipped`, ''];
if (failures.length) {
  lines.push('**Failures by cause**', '', ...Object.entries(byCategory).map(([c, n]) => `- ${c}: ${n}`), '');
  lines.push('| Test | Project | Cause | Detail |', '|---|---|---|---|');
  for (const f of failures) lines.push(`| ${f.test} | ${f.project} | ${f.category} | ${f.hint}${f.note ? ` ${f.note}.` : ''} |`);
  lines.push('');
}
if (flaky.length) {
  lines.push('**Flaky (passed only on retry)**', '', '| Test | Project | Likely cause |', '|---|---|---|');
  for (const f of flaky) lines.push(`| ${f.test} | ${f.project} | ${f.category} |`);
}
if (!failures.length && !flaky.length) lines.push('No failures or flaky tests.');

const summary = lines.join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

// Standalone HTML report next to analysis.json.
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const COLOR = { passed: '#2da44e', failed: '#cf222e', flaky: '#bf8700', skipped: '#6e7781' };
const row = (f) => `<tr><td>${esc(f.test)}</td><td>${esc(f.project)}</td><td><b>${esc(f.category)}</b></td><td>${esc(f.error)}</td><td>${esc(f.hint)} ${f.note ? `<i>${esc(f.note)}</i>` : ''}</td></tr>`;
const head = '<tr><th>Test</th><th>Project</th><th>Cause</th><th>Error</th><th>Detail</th></tr>';
const table = (rows) => (rows.length ? `<table>${head}${rows.map(row).join('')}</table>` : '<p>None.</p>');
const html = `<!doctype html><meta charset="utf-8"><title>Test result analysis</title>
<style>body{font:14px system-ui;margin:24px;background:#0d1117;color:#e6edf3}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #30363d;padding:6px 8px;text-align:left;vertical-align:top}.t{display:inline-block;padding:10px 18px;margin:0 8px 8px 0;border-radius:6px;color:#fff}</style>
<h2>Test result analysis</h2>${Object.entries(counts).map(([k, v]) => `<span class="t" style="background:${COLOR[k]}">${v} ${k}</span>`).join('')}
<h3>Failures by cause</h3>${Object.keys(byCategory).length ? `<ul>${Object.entries(byCategory).map(([k, v]) => `<li>${esc(k)}: ${v}</li>`).join('')}</ul>` : '<p>None.</p>'}
<h3>Failures</h3>${table(failures)}<h3>Flaky</h3>${table(flaky)}`;
const htmlPath = outPath.replace(/\.json$/, '.html');
fs.writeFileSync(htmlPath, html);
console.log(`\nHTML report: ${htmlPath}`);
