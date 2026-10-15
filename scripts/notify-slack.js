#!/usr/bin/env node
// Posts a one-message test summary to Slack.
// Usage: node scripts/notify-slack.js <run.json>
// Auth (either): SLACK_BOT_TOKEN + SLACK_CHANNEL_ID  (bot with chat:write, invited to the channel)
//           or:  SLACK_WEBHOOK_URL                   (incoming webhook)
// Env: DASHBOARD_URL, ALLURE_URL, REQUESTED_BY, WORKFLOW_RESULT
/* global fetch */
const fs = require('fs');

const webhook = process.env.SLACK_WEBHOOK_URL;
const { SLACK_BOT_TOKEN: botToken, SLACK_CHANNEL_ID: channel } = process.env;
if (!(botToken && channel) && !webhook) {
  console.log('No Slack credentials set (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID, or SLACK_WEBHOOK_URL), skipping.');
  process.exit(0);
}

const run = JSON.parse(fs.readFileSync(process.argv[2] ?? 'run.json', 'utf8'));
const { DASHBOARD_URL, ALLURE_URL, REQUESTED_BY, WORKFLOW_RESULT } = process.env;
const sev = run.severity ?? {};
const critOrHigh = (sev.critical?.failed ?? 0) + (sev.high?.failed ?? 0);
const smokeFailed = run.smoke?.failed ?? 0;

// Short status only; the dashboard holds the full release-readiness verdict.
let icon = ':white_check_mark:';
let status = 'Passed';
if (WORKFLOW_RESULT === 'failure' && run.failed === 0 && run.total === 0) {
  icon = ':x:'; status = 'Run failed before producing results';
} else if (smokeFailed || sev.critical?.failed) {
  icon = ':x:'; status = 'Critical failures';
} else if (run.failed) {
  icon = ':warning:'; status = critOrHigh ? 'High-severity failures' : 'Failures';
} else if (run.flaky) {
  icon = ':large_yellow_circle:'; status = 'Passed with flaky tests';
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mins = Math.round(run.durationMs / 6000) / 10;
const trigger = REQUESTED_BY ? `Requested by *${esc(REQUESTED_BY)}* from Slack` : `Trigger: ${esc(run.event)}`;

const failures = (run.failedTests ?? []).slice(0, 5)
  .map((f) => `• [${esc(f.severity ?? 'medium')}] ${esc(f.feature)} › ${esc(f.title)} (${esc(f.project)})`).join('\n');

const links = [
  run.runUrl && `<${run.runUrl}|CI run>`,
  DASHBOARD_URL && `<${DASHBOARD_URL}|Dashboard>`,
  ALLURE_URL && `<${ALLURE_URL}|Allure report>`,
].filter(Boolean).join('  ·  ');

const blocks = [
  { type: 'header', text: { type: 'plain_text', text: `${run.failed ? 'Test run needs attention' : 'Test run complete'} · #${run.runNumber}` } },
  { type: 'section', text: { type: 'mrkdwn', text: `${icon} *${status}* — ${run.passRate}% pass rate (${run.scope === 'smoke' ? 'smoke' : 'full regression'})\n${trigger}` } },
  { type: 'section', fields: [
    { type: 'mrkdwn', text: `*Checks*\n${run.total - run.skipped}` },
    { type: 'mrkdwn', text: `*Failed*\n${run.failed}` },
    { type: 'mrkdwn', text: `*Flaky*\n${run.flaky}` },
    { type: 'mrkdwn', text: `*Runtime*\n${mins} min` },
  ] },
];
if (sev.critical) {
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*By severity (failed / total)*\nCritical ${sev.critical.failed}/${sev.critical.total}  ·  High ${sev.high.failed}/${sev.high.total}  ·  Medium ${sev.medium.failed}/${sev.medium.total}  ·  Low ${sev.low.failed}/${sev.low.total}` } });
}
if (failures) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Failing checks*\n${failures}` } });
if (links) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: links }] });

const payload = { text: `${status}: ${run.passRate}% pass rate`, blocks };

async function send() {
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

send().then(() => console.log('Slack notification sent.')).catch((err) => { console.error(err.message); process.exit(1); });
