#!/usr/bin/env node
// Renders sample Slack messages (approximation of Slack's UI) to PNG so design changes can be reviewed
// without posting to a channel. Usage: node slack/preview/render.js   -> slack/preview/message-*.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { buildMessage, buildThread } = require('../../scripts/notify-slack');

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

const causes = {
  'Assertion failure': { label: 'Product behaves differently than expected', owner: 'Product / Dev', action: 'Compare expected and actual. If the site is wrong, raise a defect; if the requirement changed, update the test.' },
  'Locator / UI change': { label: 'Screen element missing or changed', owner: 'QA to confirm, then Dev', action: 'Open the screenshot. If the change is intended, update the test; if not, raise a defect.' },
};
// previous runs of the same kind, newest first (what the dashboard history provides)
const past = (rates, env) => rates.map((r, i) => ({ id: `p${i}`, runNumber: 40 - i, passRate: r, scope: 'full', environment: env }));
const go = tally(structuredClone(base));
const warn = tally({ ...structuredClone(base), runNumber: 42, event: 'schedule', severity: { critical: b(12), high: b(20, 1), medium: b(16, 0, 2), low: b(8) },
  features: { ...base.features, checkout: b(12, 1) }, causes,
  failedTests: ['firefox', 'webkit'].map((project) => ({ feature: 'checkout', file: 'checkout.spec.ts', title: 'blocks checkout when required fields are missing', project, severity: 'high', category: 'Assertion failure', what: 'Expected “First Name is required” but the page showed “”.', expected: 'First Name is required', received: '' })),
  flakyTests: [{ feature: 'cart', file: 'cart.spec.ts', title: 'the cart shows the right item count', project: 'chromium', severity: 'low', category: 'Assertion failure', what: 'Expected 2 items but found 1.' }] });
const bad = tally({ ...structuredClone(base), runNumber: 43, event: 'workflow_dispatch', environment: 'STAGING', smoke: b(12, 1), severity: { critical: b(12, 1), high: b(20, 2), medium: b(16, 0, 1), low: b(8) },
  features: { ...base.features, checkout: b(12, 3), login: b(16, 1) }, projects: { ...base.projects, firefox: b(14, 4) },
  causes,
  failedTests: [
    { feature: 'checkout', file: 'checkout.spec.ts', title: 'completes an order end-to-end with valid details', project: 'firefox', severity: 'critical', category: 'Locator / UI change', what: 'Could not find a “Finish” button on the page.' },
    { feature: 'checkout', file: 'checkout.spec.ts', title: 'the item total equals the sum of the item prices', project: 'webkit', severity: 'critical', category: 'Assertion failure', what: 'Expected “79.98” but the page showed “49.99”.', expected: '79.98', received: '49.99' },
    { feature: 'login', file: 'login.spec.ts', title: 'locked out user sees an error', project: 'firefox', severity: 'high', category: 'Assertion failure', what: 'Expected “locked out” but the page showed “”.' },
  ] });
const smokeRun = tally({ ...structuredClone(base), runNumber: 44, scope: 'smoke', environment: 'PROD', event: 'workflow_dispatch', durationMs: 18000,
  features: { login: b(4), cart: b(4), checkout: b(4) }, severity: { critical: b(12), high: b(0), medium: b(0), low: b(0) }, smoke: b(12) });
smokeRun.smoke = b(12);
const featureRun = tally({ ...structuredClone(base), runNumber: 45, scope: 'partial', suite: 'Checkout', filter: '', environment: 'QA', event: 'workflow_dispatch', durationMs: 31000, causes,
  features: { checkout: b(16, 4) }, projects: { chromium: b(4, 1), firefox: b(4, 1), webkit: b(4, 1), 'mobile-chrome': b(4, 1) },
  severity: { critical: b(0), high: b(8, 4), medium: b(8), low: b(0) }, smoke: b(0),
  failedTests: ['chromium', 'firefox', 'webkit', 'mobile-chrome'].map((project) => ({ feature: 'checkout', file: 'checkout.spec.ts', title: 'a promo code can be applied before paying', project, severity: 'high', category: 'Locator / UI change', what: 'Could not find a field with the placeholder “Promo code” on the page.' })) });
const env = { DASHBOARD_URL: 'https://x/dashboard/', ALLURE_URL: 'https://x/', WORKFLOW_URL: 'https://x/run', ACTOR: 'guna' };
const samples = {
  go: [go, env, past([99.7, 100, 100, 100, 99.7, 100, 100], 'QA')],
  conditional: [warn, { ...env, THREAD: true }, past([100, 100, 99.7, 100, 100, 100, 100], 'QA')],
  'smoke-pass': [smokeRun, { ...env, ALLURE_RUN_URL: 'https://x/latest-run/' }, past([100, 100, 100, 100], 'PROD').map((r) => ({ ...r, scope: 'smoke' }))],
  'feature-fail': [featureRun, { ...env, ALLURE_RUN_URL: 'https://x/latest-run/', THREAD: true }, past([93, 100, 93], 'QA').map((r) => ({ ...r, scope: 'partial' }))],
  'no-go': [bad, { ...env, REQUESTED_BY: '@guna' }, past([98.2, 97.5, 99, 98.6, 99.3, 98.8, 99.1], 'STAGING')],
};

const html = (s) => s.replace(/&amp;/g, '&amp;').replace(/\n/g, '<br>');
function mrkdwn(t) {
  const blocks = [];
  t = t.replace(/^&gt; (.*)$/gm, '@@Q$1@@Q').replace(/^> (.*)$/gm, '@@Q$1@@Q');
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => { blocks.push(c); return `@@${blocks.length - 1}@@`; });
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/&lt;/g, '&lt;');
  t = html(t).replace(/@@(\d+)@@/g, (_, i) => `<pre>${blocks[i].replace(/^\n/, '')}</pre>`).replace(/@@Q(.*?)@@Q(<br>)?/g, '<blockquote>$1</blockquote>');
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
function renderThread(th) {
  const out = th.blocks.map((bl) => (bl.type === 'header' ? `<div class="h">${bl.text.text}</div>` : bl.type === 'divider' ? '<hr>' : `<div class="sec">${mrkdwn(bl.text.text)}</div>`)).join('');
  return `<div class="msg" style="padding-top:0"><div class="av" style="background:#2eb67d">Q</div><div class="body"><div class="who"><b>QA Bot</b> <span class="app">APP</span> <span class="t">9:24 AM</span> <span class="t">· in thread</span></div><div style="max-width:540px">${out}</div></div></div>`;
}
const css = `blockquote{margin:6px 0;padding:2px 0 2px 12px;border-left:4px solid #ddd;color:#1d1c1d}
body{margin:0;background:#fff;font:15px/1.46668 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1c1d}
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
  for (const [name, [run, e, history]] of Object.entries(samples)) {
    await page.setContent(`<style>${css}</style>${render(buildMessage(run, e, history))}`);
    await page.locator('.msg').screenshot({ path: path.join(__dirname, `message-${name}.png`) });
    fs.writeFileSync(path.join(__dirname, `message-${name}.json`), JSON.stringify(buildMessage(run, e, history), null, 2));
    const thread = buildThread(run);
    if (thread && e.THREAD) {
      await page.setContent(`<style>${css}</style>${render(buildMessage(run, e, history))}${renderThread(thread)}`);
      await page.locator('body').screenshot({ path: path.join(__dirname, `message-${name}-with-thread.png`) });
    }
  }
  await browser.close();
  console.log('Wrote slack/preview/message-{go,conditional,no-go}.{png,json} and the thread preview');
})();
