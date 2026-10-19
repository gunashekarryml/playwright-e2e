#!/usr/bin/env node
// Posts a test-run summary to Slack (Block Kit, with a status-coloured side bar).
// Usage: node scripts/notify-slack.js <run.json>
// Auth (either): SLACK_BOT_TOKEN + SLACK_CHANNEL_ID  (bot with chat:write, invited to the channel)
//           or:  SLACK_WEBHOOK_URL                   (incoming webhook)
// Env: DASHBOARD_URL, ALLURE_URL, WORKFLOW_URL, REQUESTED_BY, ACTOR, WORKFLOW_RESULT,
//      SLACK_RUN_FORM=true  (relay is deployed: the button opens the in-Slack run form instead of GitHub)
/* global fetch */
const fs = require('fs');

const FEATURES = { login: 'Login & Auth', cart: 'Shopping Cart', checkout: 'Checkout', accessibility: 'Accessibility', inventory: 'Product Listing', 'product-details': 'Product Details', 'menu-navigation': 'Menu & Navigation', 'dynamic-catalog': 'Dynamic Catalog', 'user-profiles': 'User Profiles' };
const BROWSERS = { chromium: 'Chrome', firefox: 'Firefox', webkit: 'Safari', 'mobile-chrome': 'Android' };
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEV_DOT = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const COLOR = { good: '#2eb67d', warn: '#ecb22e', bad: '#e01e5a' };

// Mirrors the release criteria in dashboard/index.html (POLICY). Keep the two in sync.
// Blockers: smoke failure, any critical failure, high-severity pass rate below `highBlock`, overall below regression[1],
// flaky above flake[1], a feature below feature[1], a browser below browser[1]. Everything else below target is a caution.
const POLICY = { highBlock: 90, regression: [95, 85], minor: { medium: 90, low: 80 }, flake: [5, 10], feature: [85, 70], browser: [90, 80] };

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nice = (m, k) => m[k] ?? k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const ran = (b) => b.total - b.skipped;
const rate = (b) => (ran(b) ? Math.round(((b.passed + b.flaky) / ran(b)) * 1000) / 10 : null);
const dot = (p, [good, warn]) => (p === null ? '⚪' : p >= good ? '🟢' : p >= warn ? '🟡' : '🔴');

function meter(p, tone, width = 10) {
  const filled = Math.round(((p ?? 0) / 100) * width);
  const sq = { good: '🟩', warn: '🟨', bad: '🟥' }[tone];
  return sq.repeat(filled) + '⬜'.repeat(width - filled);
}

function verdictOf(run) {
  const sev = run.severity ?? {};
  const flake = ran(run) ? (run.flaky / ran(run)) * 100 : 0;
  const reg = run.passRate;
  const hr = sev.high ? rate(sev.high) : null, mr = sev.medium ? rate(sev.medium) : null, lr = sev.low ? rate(sev.low) : null;
  const lowFeature = Math.min(...Object.values(run.features ?? {}).map((b) => rate(b) ?? 100), 100);
  const lowBrowser = Math.min(...Object.values(run.projects ?? {}).map((b) => rate(b) ?? 100), 100);
  const blockers = [];
  const cautions = [];
  if (run.smoke?.failed) blockers.push('a critical journey is failing');
  if (sev.critical?.failed) blockers.push('critical-severity checks are failing');
  if (hr !== null && hr < POLICY.highBlock) blockers.push(`the high-severity pass rate is ${hr}%`);
  if (reg < POLICY.regression[1]) blockers.push(`overall quality is ${reg}%`);
  if (flake > POLICY.flake[1]) blockers.push('too many flaky tests');
  if (lowFeature < POLICY.feature[1]) blockers.push(`a feature is at ${lowFeature}%`);
  if (lowBrowser < POLICY.browser[1]) blockers.push(`a browser is at ${lowBrowser}%`);
  if (!blockers.length) {
    if (sev.high?.failed) cautions.push(`high-severity cases are failing (${hr}% pass)`);
    if (reg < POLICY.regression[0]) cautions.push(`overall quality is ${reg}% (target ${POLICY.regression[0]}%)`);
    if ((mr !== null && mr < POLICY.minor.medium) || (lr !== null && lr < POLICY.minor.low)) cautions.push('medium or low issues are above the limit');
    if (flake > POLICY.flake[0]) cautions.push('some tests are flaky');
    if (lowFeature < POLICY.feature[0]) cautions.push(`a feature is at ${lowFeature}%`);
    if (lowBrowser < POLICY.browser[0]) cautions.push(`a browser is at ${lowBrowser}%`);
  }
  const say = (l) => { const t = l.slice(0, 2).join(' and '); return t[0].toUpperCase() + t.slice(1); };
  if (blockers.length) return { tone: 'bad', icon: '🔴', label: 'NO-GO', line: `Not ready to release — ${say(blockers).toLowerCase()}.` };
  if (cautions.length) return { tone: 'warn', icon: '🟡', label: 'CONDITIONAL', line: `Release with caution — ${say(cautions).toLowerCase()}.` };
  return { tone: 'good', icon: '🟢', label: 'GO', line: 'Safe to release — critical journeys work and critical and high-severity cases pass.' };
}

function buildMessage(run, env = {}) {
  const { DASHBOARD_URL, ALLURE_URL, WORKFLOW_URL, REQUESTED_BY, ACTOR, WORKFLOW_RESULT, SLACK_RUN_FORM } = env;
  const v = verdictOf(run);
  const sev = run.severity;
  const scope = run.scope === 'smoke' ? 'Smoke'
    : run.scope === 'partial' ? `${[run.suite && run.suite !== 'Full Regression' && run.suite, run.filter].filter(Boolean).join(' · ')} (partial run)`
    : 'Full regression';
  const envName = run.environment && run.environment !== 'Default' ? run.environment : null;
  const who = REQUESTED_BY ? `requested by ${esc(REQUESTED_BY)} from Slack`
    : run.event === 'workflow_dispatch' ? `started by ${esc(ACTOR ?? 'someone')}`
    : ({ schedule: 'nightly schedule', push: 'merge to main' }[run.event] ?? esc(run.event));
  const mins = run.durationMs >= 60000 ? `${Math.floor(run.durationMs / 60000)}m ${Math.round((run.durationMs % 60000) / 1000)}s` : `${Math.round(run.durationMs / 1000)}s`;
  const broken = WORKFLOW_RESULT === 'failure' && run.total === 0;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${v.icon}  ${v.label} · Run #${run.runNumber}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: [`*${scope}*`, envName && `Env *${esc(envName)}*`, who].filter(Boolean).join('  ·  ') }] },
    { type: 'section', text: { type: 'mrkdwn', text: broken ? '*The run failed before producing results.* Check the CI run for details.' : `*${v.line}*\n${meter(run.passRate, v.tone)}  *${run.passRate}%* pass rate` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `✅ *${run.passed + run.flaky}* passed    ${run.failed ? '🔴' : '▫️'} *${run.failed}* failed    ${run.flaky ? '🟡' : '▫️'} *${run.flaky}* flaky    ⏭ *${run.skipped}* skipped    ⏱ *${mins}*` }] },
  ];

  if (sev) {
    const cells = (label, b) => `${label.padEnd(9)}${String(ran(b)).padStart(6)}${String(b.passed + b.flaky).padStart(7)}${String(b.failed).padStart(7)}${String(b.skipped).padStart(7)}`;
    const rows = SEVERITIES.map((k) => `${cells(k[0].toUpperCase() + k.slice(1), sev[k])}${sev[k].failed ? '  ◀' : ''}`);
    const head = `${'Severity'.padEnd(9)}${'Total'.padStart(6)}${'Pass'.padStart(7)}${'Fail'.padStart(7)}${'Skip'.padStart(7)}`;
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Severity breakdown*\n\`\`\`${head}\n${rows.join('\n')}\`\`\`` } });
  }

  const feats = Object.entries(run.features ?? {}).map(([k, b]) => [k, rate(b)]).sort((a, b) => (a[1] ?? 101) - (b[1] ?? 101));
  if (feats.length) {
    const lines = feats.slice(0, 5).map(([k, p]) => `${dot(p, POLICY.feature)} ${nice(FEATURES, k)} *${p ?? '–'}%*`);
    const browsers = Object.entries(run.projects ?? {}).map(([k, b]) => `${dot(rate(b), POLICY.browser)} ${nice(BROWSERS, k)} ${rate(b) ?? '–'}%`).join('   ');
    blocks.push({ type: 'section', fields: [
      { type: 'mrkdwn', text: `*Features*\n${lines.join('\n')}` },
      { type: 'mrkdwn', text: `*Browsers*\n${browsers.split('   ').join('\n')}` },
    ] });
  }

  const failed = (run.failedTests ?? []).slice().sort((a, b) => SEVERITIES.indexOf(a.severity ?? 'medium') - SEVERITIES.indexOf(b.severity ?? 'medium'));
  if (failed.length) {
    const lines = failed.slice(0, 4).map((f) => `${SEV_DOT[f.severity] ?? '🟡'} *${esc(nice(FEATURES, f.feature))}* — ${esc(f.title)}  _(${esc(nice(BROWSERS, f.project))})_`);
    if (failed.length > 4) lines.push(`_+${failed.length - 4} more in the report_`);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Needs attention*\n${lines.join('\n')}` } });
  }

  const buttons = [
    DASHBOARD_URL && { type: 'button', text: { type: 'plain_text', text: '📊 Dashboard', emoji: true }, url: DASHBOARD_URL, style: 'primary' },
    ALLURE_URL && { type: 'button', text: { type: 'plain_text', text: '📑 Allure report', emoji: true }, url: ALLURE_URL },
    run.runUrl && { type: 'button', text: { type: 'plain_text', text: '⚙️ CI run', emoji: true }, url: run.runUrl },
    SLACK_RUN_FORM === 'true'
      ? { type: 'button', text: { type: 'plain_text', text: '▶️ Configure & run', emoji: true }, action_id: 'qa_open_form', value: 'open' }
      : WORKFLOW_URL && { type: 'button', text: { type: 'plain_text', text: '▶️ Run again', emoji: true }, url: WORKFLOW_URL },
  ].filter(Boolean);
  if (buttons.length) blocks.push({ type: 'actions', elements: buttons });

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${esc(run.branch)}${run.sha ? ` @ \`${esc(run.sha)}\`` : ''}  ·  ${new Date(run.date).toUTCString().replace(' GMT', ' UTC')}` }] });

  // `attachments` gives the coloured status bar down the left edge of the message.
  return { text: `${v.label}: Run #${run.runNumber} — ${run.passRate}% pass rate`, attachments: [{ color: COLOR[v.tone], blocks }] };
}

async function send(payload, { webhook, botToken, channel }) {
  if (botToken && channel) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ ...payload, channel }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error}${data.error === 'not_in_channel' ? ' (invite the bot: /invite @YourBot)' : ''}`);
    return;
  }
  const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
}

module.exports = { buildMessage };

if (require.main === module) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const { SLACK_BOT_TOKEN: botToken, SLACK_CHANNEL_ID: channel } = process.env;
  if (!(botToken && channel) && !webhook) {
    console.log('No Slack credentials set (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID, or SLACK_WEBHOOK_URL), skipping.');
    process.exit(0);
  }
  const run = JSON.parse(fs.readFileSync(process.argv[2] ?? 'run.json', 'utf8'));
  send(buildMessage(run, process.env), { webhook, botToken, channel })
    .then(() => console.log('Slack notification sent.'))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
