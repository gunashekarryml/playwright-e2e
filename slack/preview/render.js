#!/usr/bin/env node
// Renders sample Slack messages (approximation of Slack's UI) to PNG so design changes can be reviewed
// without posting to a channel. Usage: node slack/preview/render.js   -> slack/preview/message-*.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { buildMessage } = require('../../scripts/notify-slack');

const b = (total, failed = 0, flaky = 0, skipped = 0) => ({ total, passed: total - failed - flaky - skipped, failed, flaky, skipped });
const base = {
  runNumber: 41, date: '2026-10-15T09:24:00Z', event: 'push', branch: 'main', sha: '1f4ffce', scope: 'full', environment: 'QA',
  runUrl: 'https://github.com/o/r/actions/runs/1', durationMs: 252000, failedTests: [],
  features: { login: b(16), cart: b(16), checkout: b(12), accessibility: b(16) },
  projects: { chromium: b(14), firefox: b(14), webkit: b(14), 'mobile-chrome': b(14) },
  severity: { critical: b(12), high: b(20), medium: b(16), low: b(8) },
  smoke: b(12),
};
const tally = (r) => { const all = Object.values(r.severity); r.total = all.reduce((n, x) => n + x.total, 0); r.passed = all.reduce((n, x) => n + x.passed, 0); r.failed = all.reduce((n, x) => n + x.failed, 0); r.flaky = all.reduce((n, x) => n + x.flaky, 0); r.skipped = all.reduce((n, x) => n + x.skipped, 0); r.passRate = Math.round(((r.passed + r.flaky) / (r.total - r.skipped)) * 1000) / 10; return r; };

const go = tally(structuredClone(base));
const warn = tally({ ...structuredClone(base), runNumber: 42, event: 'schedule', severity: { critical: b(12), high: b(20, 1), medium: b(16, 0, 2), low: b(8) },
  features: { ...base.features, checkout: b(12, 1) }, failedTests: [{ feature: 'checkout', title: 'blocks checkout when required fields are missing', project: 'firefox', severity: 'high' }] });
const bad = tally({ ...structuredClone(base), runNumber: 43, event: 'workflow_dispatch', environment: 'STAGING', smoke: b(12, 1), severity: { critical: b(12, 1), high: b(20, 2), medium: b(16, 0, 1), low: b(8) },
  features: { ...base.features, checkout: b(12, 3), login: b(16, 1) }, projects: { ...base.projects, firefox: b(14, 4) },
  failedTests: [
    { feature: 'checkout', title: 'completes an order end-to-end with valid details', project: 'firefox', severity: 'critical' },
    { feature: 'checkout', title: 'blocks checkout when required fields are missing', project: 'webkit', severity: 'high' },
    { feature: 'login', title: 'locked out user sees an error', project: 'firefox', severity: 'high' },
  ] });
const env = { DASHBOARD_URL: 'https://x/dashboard/', ALLURE_URL: 'https://x/', WORKFLOW_URL: 'https://x/run', ACTOR: 'guna' };
const samples = { go: [go, env], conditional: [warn, env], 'no-go': [bad, { ...env, REQUESTED_BY: '@guna' }] };

const html = (s) => s.replace(/&amp;/g, '&amp;').replace(/\n/g, '<br>');
function mrkdwn(t) {
  const blocks = [];
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => { blocks.push(c); return `@@${blocks.length - 1}@@`; });
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/&lt;/g, '&lt;');
  t = html(t).replace(/@@(\d+)@@/g, (_, i) => `<pre>${blocks[i].replace(/^\n/, '')}</pre>`);
  return t;
}
function render(msg) {
  const att = msg.attachments[0];
  const out = att.blocks.map((bl) => {
    if (bl.type === 'header') return `<div class="h">${bl.text.text}</div>`;
    if (bl.type === 'divider') return '<hr>';
    if (bl.type === 'context') return `<div class="ctx">${bl.elements.map((e) => mrkdwn(e.text)).join(' ')}</div>`;
    if (bl.type === 'section') return `${bl.text ? `<div class="sec">${mrkdwn(bl.text.text)}</div>` : ''}${bl.fields ? `<div class="fields">${bl.fields.map((f) => `<div>${mrkdwn(f.text)}</div>`).join('')}</div>` : ''}`;
    if (bl.type === 'actions') return `<div class="acts">${bl.elements.map((e) => `<span class="btn ${e.style ?? ''}">${e.text.text}</span>`).join('')}</div>`;
    return '';
  }).join('');
  return `<div class="msg"><div class="av">Q</div><div class="body"><div class="who"><b>QA Bot</b> <span class="app">APP</span> <span class="t">9:24 AM</span></div>
    <div class="att" style="border-left-color:${att.color}">${out}</div></div></div>`;
}
const css = `body{margin:0;background:#fff;font:15px/1.46668 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1c1d}
.msg{display:flex;gap:8px;padding:12px 20px;width:760px}.av{flex:none;width:36px;height:36px;border-radius:6px;background:linear-gradient(135deg,#5b5bf0,#9a6bff);color:#fff;font-weight:800;display:grid;place-items:center}
.who{margin-bottom:2px}.who b{font-weight:900}.app{background:#e8e8e8;border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;color:#616061}.t{color:#616061;font-size:12px;margin-left:4px}
.att{border-left:4px solid;border-radius:4px;padding:2px 0 2px 12px;max-width:540px}
.h{font-size:18px;font-weight:900;margin:6px 0 4px}.ctx{font-size:12px;color:#616061;margin:2px 0 6px}.ctx b{color:#454245}
.sec{margin:6px 0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:8px 0}
code{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:3px;padding:1px 3px;color:#e01e5a;font:12px Monaco,Menlo,monospace}
pre{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:4px;padding:8px;margin:6px 0;font:12px/1.5 Monaco,Menlo,monospace;color:#1d1c1d;white-space:pre}
hr{border:0;border-top:1px solid #ddd;margin:8px 0}.acts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px}
.btn{border:1px solid #bbb;border-radius:6px;padding:4px 12px;font-weight:700;font-size:13px;background:#fff}.btn.primary{background:#007a5a;border-color:#007a5a;color:#fff}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 790, height: 400 } });
  for (const [name, [run, e]] of Object.entries(samples)) {
    await page.setContent(`<style>${css}</style>${render(buildMessage(run, e))}`);
    await page.locator('.msg').screenshot({ path: path.join(__dirname, `message-${name}.png`) });
    fs.writeFileSync(path.join(__dirname, `message-${name}.json`), JSON.stringify(buildMessage(run, e), null, 2));
  }
  await browser.close();
  console.log('Wrote slack/preview/message-{go,conditional,no-go}.{png,json}');
})();
