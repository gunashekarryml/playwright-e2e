#!/usr/bin/env node
// Posts a test-run summary to Slack (Block Kit, with a status-coloured side bar).
// Usage: node scripts/notify-slack.js <run.json>
// Auth (either): SLACK_BOT_TOKEN + SLACK_CHANNEL_ID  (bot with chat:write, invited to the channel)
//           or:  SLACK_WEBHOOK_URL                   (incoming webhook; no thread reply)
// Env: DASHBOARD_URL, ALLURE_URL, WORKFLOW_URL, REQUESTED_BY, ACTOR, WORKFLOW_RESULT, SLACK_RUN_FORM
//      DASHBOARD_URL is also used to read data/runs.json so the message can show the trend and the change vs the previous run.
/* global fetch, AbortController, setTimeout, clearTimeout */
const fs = require('fs');

const FEATURES = {
  login: 'Login & Auth', cart: 'Shopping Cart', checkout: 'Checkout', accessibility: 'Accessibility', inventory: 'Product Listing',
  'product-details': 'Product Details', 'menu-navigation': 'Menu & Navigation', 'dynamic-catalog': 'Dynamic Catalog', 'user-profiles': 'User Profiles',
};
const BROWSERS = { chromium: 'Chrome', firefox: 'Firefox', webkit: 'Safari', 'mobile-chrome': 'Android' };
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEV_DOT = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const COLOR = { good: '#2eb67d', warn: '#ecb22e', bad: '#e01e5a', info: '#36c5f0' };

// Release criteria: keep in sync with POLICY in dashboard/index.html.
const POLICY = {
  regression: [95, 85],         // overall pass rate: >= first is green, >= second is amber, below is a blocker
  highBlock: 90,                // high-severity pass rate below this blocks; any failure below 100% is amber
  minor: { medium: 90, low: 80 },
  flake: [5, 10], feature: [85, 70], browser: [90, 80], drop: 5,
};

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nice = (m, k) => m[k] ?? k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const ran = (b) => b.total - b.skipped;
const rate = (b) => (b && ran(b) ? Math.round(((b.passed + b.flaky) / ran(b)) * 1000) / 10 : null);
const pct = (n) => (n === null || n === undefined ? '–' : `${n}%`);
const dot = (p, [good, warn]) => (p === null ? '⚪' : p >= good ? '🟢' : p >= warn ? '🟡' : '🔴');
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

function meter(p, tone, width = 10) {
  const filled = Math.round(((p ?? 0) / 100) * width);
  return { good: '🟩', warn: '🟨', bad: '🟥' }[tone].repeat(filled) + '⬜'.repeat(width - filled);
}
const bar = (p, width = 10) => '█'.repeat(Math.round(((p ?? 0) / 100) * width)).padEnd(width, '░');
const spark = (vals) => {
  const v = vals.filter((x) => x !== null && x !== undefined);
  if (v.length < 2) return '';
  const min = Math.min(...v), top = 100, blocks = '▁▂▃▄▅▆▇█';
  return v.map((x) => (min === top ? '▇' : blocks[Math.max(0, Math.min(7, Math.round(((x - min) / (top - min)) * 7)))])).join('');
};

// ---- release checks (same rules and wording as the dashboard) ----
function gatesOf(run, prev) {
  const gates = [];
  const add = (name, status, detail, short) => gates.push({ name, status, detail, short: short ?? detail });
  const sev = run.severity, sm = run.smoke;
  const flake = ran(run) ? (run.flaky / ran(run)) * 100 : 0;

  if (!sm || !ran(sm)) add('Critical journeys work', 'wn', 'No smoke tests in this run', 'no smoke tests ran');
  else if (sm.failed) add('Critical journeys work', 'no', `${sm.failed} of ${ran(sm)} failing`, 'a critical journey is failing');
  else add('Critical journeys work', 'ok', `All ${ran(sm)} pass`);

  if (sev) {
    const c = sev.critical, h = sev.high, hr = rate(h);
    const status = c.failed ? 'no' : hr !== null && hr < POLICY.highBlock ? 'no' : h.failed ? 'wn' : 'ok';
    add('Critical & high-severity pass', status, c.failed ? `${c.failed} critical failing` : h.failed ? `High severity ${pct(hr)} pass` : 'All pass',
      c.failed ? `${c.failed} critical-severity check${c.failed > 1 ? 's are' : ' is'} failing` : `the high-severity pass rate is ${pct(hr)} (needs 100%)`);
  }
  const reg = run.passRate;
  add('Overall pass rate', reg >= POLICY.regression[0] ? 'ok' : reg >= POLICY.regression[1] ? 'wn' : 'no', `${pct(reg)} (target ${POLICY.regression[0]}%)`, `overall quality is ${pct(reg)} (target ${POLICY.regression[0]}%)`);
  if (sev) {
    const mr = rate(sev.medium), lr = rate(sev.low);
    const fine = (mr === null || mr >= POLICY.minor.medium) && (lr === null || lr >= POLICY.minor.low);
    add('Medium & low within limits', fine ? 'ok' : 'wn', `Medium ${pct(mr)} · Low ${pct(lr)}`, `medium or low issues are above the limit (medium ${pct(mr)}, low ${pct(lr)})`);
  }
  add('Tests are stable', flake <= POLICY.flake[0] ? 'ok' : flake <= POLICY.flake[1] ? 'wn' : 'no', `${Math.round(flake * 10) / 10}% flaky`, `${Math.round(flake * 10) / 10}% of checks are flaky`);
  const fe = Object.entries(run.features ?? {}).map(([k, b]) => [k, rate(b)]).filter(([, p]) => p !== null).sort((a, b) => a[1] - b[1])[0];
  if (fe) add('Every feature healthy', fe[1] >= POLICY.feature[0] ? 'ok' : fe[1] >= POLICY.feature[1] ? 'wn' : 'no', `${nice(FEATURES, fe[0])} ${fe[1]}%`, `${nice(FEATURES, fe[0])} is at ${fe[1]}%`);
  const br = Object.entries(run.projects ?? {}).map(([k, b]) => [k, rate(b)]).filter(([, p]) => p !== null).sort((a, b) => a[1] - b[1])[0];
  if (br) add('Works on every browser', br[1] >= POLICY.browser[0] ? 'ok' : br[1] >= POLICY.browser[1] ? 'wn' : 'no', `${nice(BROWSERS, br[0])} ${br[1]}%`, `${nice(BROWSERS, br[0])} is at ${br[1]}%`);
  if (prev) {
    const d = Math.round((reg - prev.passRate) * 10) / 10;
    add('Quality not dropping', d >= -POLICY.drop ? 'ok' : 'wn', d >= 0 ? `Up ${d} pts` : `Down ${Math.abs(d)} pts`, `quality dropped ${Math.abs(d)} points since the previous run`);
  }
  return gates;
}
const verdictOf = (gates) => (gates.some((g) => g.status === 'no') ? 'bad' : gates.some((g) => g.status === 'wn') ? 'warn' : 'good');
function reasonOf(verdict, gates) {
  const say = (l) => { const t = l.slice(0, 2).map((g) => g.short).join(' and '); return t[0].toUpperCase() + t.slice(1); };
  if (verdict === 'good') return 'All release criteria are met: critical journeys work, critical and high-severity cases pass, and quality is on target.';
  if (verdict === 'warn') return `${say(gates.filter((g) => g.status === 'wn'))}. Nothing blocks the release, but agree these known issues with the owners first.`;
  return `${say(gates.filter((g) => g.status === 'no'))}. Fix before releasing.`;
}
const VERDICT = {
  good: { icon: '🟢', label: 'GO', headline: 'Ready to release' },
  warn: { icon: '🟡', label: 'CONDITIONAL', headline: 'Release with caution' },
  bad: { icon: '🔴', label: 'NO-GO', headline: 'Not ready to release' },
};
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const NEXT = {
  good: () => 'No action needed. Proceed with the release.',
  warn: (g) => `Get the owners to sign off the ${plural(g.filter((x) => x.status === 'wn').length, 'known issue')}, then release.`,
  bad: (g) => `Fix the ${plural(g.filter((x) => x.status === 'no').length, 'blocking issue')} before releasing.`,
};

// Distinct issues (one per check, however many browsers it failed on), worst first.
function issuesOf(run) {
  const group = (arr) => { const m = new Map(); for (const f of arr) { const k = `${f.file}|${f.title}`; (m.get(k) ?? m.set(k, { ...f, projects: [] }).get(k)).projects.push(f.project); } return [...m.values()]; };
  const rank = (s) => SEVERITIES.indexOf(s ?? 'medium');
  return {
    fails: group(run.failedTests ?? []).sort((a, b) => rank(a.severity) - rank(b.severity) || b.projects.length - a.projects.length),
    flaky: group(run.flakyTests ?? []),
  };
}

function buildMessage(run, env = {}, history = []) {
  const { DASHBOARD_URL, ALLURE_URL, ALLURE_RUN_URL, WORKFLOW_URL, REQUESTED_BY, ACTOR, WORKFLOW_RESULT, SLACK_RUN_FORM } = env;
  const sameKind = (r) => (r.scope ?? 'full') === (run.scope ?? 'full') && (r.environment || 'Default') === (run.environment || 'Default');
  const peers = history.filter((r) => r.id !== run.id && sameKind(r));
  const prev = peers[0] ?? null;
  const gates = gatesOf(run, prev);
  // A smoke or feature run never produces a release verdict: it can pass, or show failures, but only a full regression can say GO.
  const partialRun = (run.scope ?? 'full') !== 'full';
  const scopeName = run.scope === 'smoke' ? 'Smoke' : ([run.suite && run.suite !== 'Full Regression' && run.suite, run.filter].filter(Boolean).join(' · ') || 'Partial');
  let verdict = verdictOf(gates), V = VERDICT[verdict];
  if (partialRun) {
    verdict = run.failed ? (run.smoke?.failed || run.severity?.critical?.failed ? 'bad' : 'warn') : 'info';
    V = { info: { icon: '🔵', label: `${scopeName.toUpperCase()} PASSED`, headline: `${scopeName} passed` },
      warn: { icon: '🟡', label: `${scopeName.toUpperCase()} HAS FAILURES`, headline: `${scopeName}: some checks failed` },
      bad: { icon: '🔴', label: `${scopeName.toUpperCase()} FAILED`, headline: `${scopeName} is failing` } }[verdict];
  }
  const counts = { ok: gates.filter((g) => g.status === 'ok').length, wn: gates.filter((g) => g.status === 'wn').length, no: gates.filter((g) => g.status === 'no').length };
  const scope = run.scope === 'smoke' ? 'Smoke' : run.scope === 'partial' ? `${[run.suite && run.suite !== 'Full Regression' && run.suite, run.filter].filter(Boolean).join(' · ')} (partial)` : 'Full regression';
  const envName = run.environment && run.environment !== 'Default' ? run.environment : null;
  const who = REQUESTED_BY ? `requested by ${esc(REQUESTED_BY)}`
    : run.event === 'workflow_dispatch' ? `started by ${esc(ACTOR ?? 'someone')}`
    : ({ schedule: 'nightly schedule', push: 'merge to main' }[run.event] ?? esc(run.event));
  const mins = run.durationMs >= 60000 ? `${Math.floor(run.durationMs / 60000)}m ${Math.round((run.durationMs % 60000) / 1000)}s` : `${Math.round(run.durationMs / 1000)}s`;
  const broken = WORKFLOW_RESULT === 'failure' && run.total === 0;

  // trend: the last 8 runs of the same kind, oldest first
  const series = [...peers.slice(0, 7).reverse().map((r) => r.passRate), run.passRate];
  const delta = prev ? Math.round((run.passRate - prev.passRate) * 10) / 10 : null;
  const tone = run.passRate >= POLICY.regression[0] ? 'good' : run.passRate >= POLICY.regression[1] ? 'warn' : 'bad';
  const deltaText = delta === null ? '' : delta === 0 ? '  ▬ no change' : `  ${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs previous`;

  const { fails, flaky } = issuesOf(run);
  const nBrowsers = Object.keys(run.projects ?? {}).length;
  const causeLabel = (f) => run.causes?.[f.category]?.label ?? f.category ?? '';
  const topIssues = fails.slice(0, 3).map((f) => `${SEV_DOT[f.severity] ?? '🟡'} *${esc(nice(FEATURES, f.feature))}* · ${esc(clip(f.title, 70))}\n      ${esc(clip(f.what ?? f.error ?? '', 90))}\n      _${f.projects.length >= nBrowsers ? 'all browsers' : esc(f.projects.map((p) => nice(BROWSERS, p)).join(', '))}${causeLabel(f) ? ` · ${esc(causeLabel(f))}` : ''}_`);

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${V.icon}  ${V.headline}  ·  Run #${run.runNumber}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: [`*${V.label}*`, envName && `🌐 *${esc(envName)}*`, `🧪 ${esc(scope)}`, `👤 ${who}`, `⏱ ${mins}`].filter(Boolean).join('   ·   ') }] },
  ];
  if (broken) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*The run failed before producing results.* Open the CI run for details.' } });
  } else {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${run.passRate}%*  pass rate${deltaText}\n${meter(run.passRate, tone)}${partialRun ? '' : `   _target ${POLICY.regression[0]}%_`}${series.length > 1 ? `\n\`${spark(series)}\`  _last ${series.length} runs_` : ''}` } });
    const partialReason = run.failed ? `${run.failed} of ${ran(run)} checks failed. A ${scopeName.toLowerCase()} run cannot approve a release.` : `All ${ran(run)} checks passed. This was a ${scopeName.toLowerCase()} run, so there is no release verdict until a full regression runs.`;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `> ${esc(partialRun ? partialReason : reasonOf(verdict, gates))}` } });
    blocks.push({ type: 'divider' });
    if (!partialRun) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Release checks*  ·  *${counts.ok} of ${gates.length}* passed${counts.wn ? `  ·  🟡 ${counts.wn} need attention` : ''}${counts.no ? `  ·  🔴 ${counts.no} failed` : ''}` } });
    if (partialRun) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*Release verdict:* not assessed by this run' } });
    // Only the checks that need a look get a tile; the passing ones fold into one line so the message stays short.
    const order = { no: 0, wn: 1 };
    const attention = partialRun ? [] : gates.filter((g) => g.status !== 'ok').sort((x, y) => order[x.status] - order[y.status]);
    if (attention.length) blocks.push({ type: 'section', fields: attention.map((g) => ({ type: 'mrkdwn', text: `${g.status === 'no' ? '🔴' : '🟡'} *${esc(g.name)}*\n      _${esc(g.detail)}_` })) });
    const passing = partialRun ? [] : gates.filter((g) => g.status === 'ok');
    if (passing.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `✅ ${passing.map((g) => esc(g.name)).join('  ·  ')}` }] });
  }

  if (run.severity) {
    const rows = SEVERITIES.filter((k) => ran(run.severity[k]) > 0).map((k) => { const b = run.severity[k], p = rate(b); return `${k[0].toUpperCase() + k.slice(1)}`.padEnd(9) + bar(p) + String(p === null ? '–' : Math.round(p)).padStart(5) + '%' + (b.failed ? `  ${b.failed} failed` : '  ✓'); });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*By severity*\n\`\`\`${rows.join('\n')}\`\`\`` } });
  }
  const feats = Object.entries(run.features ?? {}).map(([k, b]) => [k, rate(b)]).sort((a, b) => (a[1] ?? 101) - (b[1] ?? 101));
  if (feats.length) {
    const rows = feats.slice(0, 5).map(([k, p]) => clip(nice(FEATURES, k), 17).padEnd(18) + bar(p, 8) + String(p === null ? '–' : Math.round(p)).padStart(5) + '%');
    const browsers = Object.entries(run.projects ?? {}).map(([k, b]) => `${dot(rate(b), POLICY.browser)} ${nice(BROWSERS, k)} ${pct(rate(b))}`).join('   ');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*By feature*  _weakest first_\n\`\`\`${rows.join('\n')}\`\`\`${browsers ? `\n${browsers}` : ''}` } });
  }

  if (topIssues.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Needs attention*  ·  ${plural(fails.length, 'issue')}${flaky.length ? `  ·  ${flaky.length} unstable` : ''}\n\n${topIssues.join('\n\n')}${fails.length > 3 ? `\n\n_+${fails.length - 3} more ${env.THREAD ? 'in the thread 🧵' : 'in the dashboard'}_` : ''}` } });
  }
  const nextText = partialRun ? (run.failed ? 'Fix the failing checks, then re-run.' : 'Run the full regression to get a release verdict.') : NEXT[verdict](gates);
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `> *Next:* ${esc(nextText)}` } });

  const buttons = [
    DASHBOARD_URL && { type: 'button', text: { type: 'plain_text', text: '📊 Dashboard', emoji: true }, url: DASHBOARD_URL, style: 'primary' },
    (partialRun && ALLURE_RUN_URL ? ALLURE_RUN_URL : ALLURE_URL) && { type: 'button', text: { type: 'plain_text', text: partialRun && ALLURE_RUN_URL ? "📑 This run's report" : '📑 Allure report', emoji: true }, url: partialRun && ALLURE_RUN_URL ? ALLURE_RUN_URL : ALLURE_URL },
    run.runUrl && { type: 'button', text: { type: 'plain_text', text: '⚙️ CI run', emoji: true }, url: run.runUrl },
    SLACK_RUN_FORM === 'true'
      ? { type: 'button', text: { type: 'plain_text', text: '▶️ Configure & run', emoji: true }, action_id: 'qa_open_form', value: 'open' }
      : WORKFLOW_URL && { type: 'button', text: { type: 'plain_text', text: '▶️ Run again', emoji: true }, url: WORKFLOW_URL },
  ].filter(Boolean);
  if (buttons.length) blocks.push({ type: 'actions', elements: buttons });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `\`${esc(run.branch)}${run.sha ? ` @ ${esc(run.sha)}` : ''}\`   ·   ${new Date(run.date).toUTCString().replace(' GMT', ' UTC')}${prev ? `   ·   compared with run #${prev.runNumber}` : ''}` }] });

  // `attachments` gives the coloured status bar down the left edge of the message.
  return { text: `${V.label}: Run #${run.runNumber} · ${run.passRate}% pass rate`, attachments: [{ color: COLOR[verdict], blocks }] };
}

// Full issue list as a thread reply, so the channel message stays short (bot token only).
function buildThread(run) {
  const { fails, flaky } = issuesOf(run);
  if (!fails.length && !flaky.length) return null;
  const info = (f) => run.causes?.[f.category] ?? {};
  const FLAKY = { label: 'Intermittent failure', owner: 'QA', action: 'Find out why it fails intermittently instead of re-running it: check the waits, the data set-up and the environment.' };
  const line = (f, unstable) => { const i = unstable ? FLAKY : info(f); return `${SEV_DOT[f.severity] ?? '🟡'} *${esc(nice(FEATURES, f.feature))}* · ${esc(f.title)}\n      ${unstable ? 'First failure: ' : ''}${esc(f.what ?? f.error ?? '')}${f.expected && f.received ? `\n      Expected \`${esc(f.expected)}\`  →  actual \`${esc(f.received)}\`` : ''}\n      _${esc(f.projects.map((p) => nice(BROWSERS, p)).join(', '))}${i.label ? ` · ${esc(i.label)}` : ''}${i.owner ? ` · owner: ${esc(i.owner)}` : ''}_${i.action ? `\n      ➜ ${esc(i.action)}` : ''}`; };
  const chunks = (arr) => { const out = []; let cur = ''; for (const x of arr) { if ((cur + x).length > 2600) { out.push(cur); cur = ''; } cur += `${cur ? '\n\n' : ''}${x}`; } if (cur) out.push(cur); return out; };
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: `🔎  All issues  ·  Run #${run.runNumber}`, emoji: true } }];
  if (fails.length) { blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Failing checks* · ${fails.length}` } }); for (const c of chunks(fails.map((f) => line(f, false)))) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: c } }); }
  if (flaky.length) { blocks.push({ type: 'divider' }); blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Unstable checks* · ${flaky.length}  _failed first, then passed on retry_` } }); for (const c of chunks(flaky.map((f) => line(f, true)))) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: c } }); }
  return { text: `All issues for run #${run.runNumber}`, blocks: blocks.slice(0, 48) };
}

async function loadHistory(base) {
  if (!base) return [];
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${base.replace(/\/?$/, '/')}data/runs.json`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok ? await res.json() : [];
  } catch { return []; } // the trend is a nice-to-have; never block the notification
}

async function slackApi(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}${data.error === 'not_in_channel' ? ' (invite the bot: /invite @YourBot)' : ''}`);
  return data;
}

async function send(payload, thread, { webhook, botToken, channel }) {
  if (botToken && channel) {
    const posted = await slackApi(botToken, 'chat.postMessage', { ...payload, channel });
    if (thread) await slackApi(botToken, 'chat.postMessage', { ...thread, channel, thread_ts: posted.ts }).catch((e) => console.error(`Thread reply skipped: ${e.message}`));
    return;
  }
  const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
}

module.exports = { buildMessage, buildThread };

if (require.main === module) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const { SLACK_BOT_TOKEN: botToken, SLACK_CHANNEL_ID: channel } = process.env;
  if (!(botToken && channel) && !webhook) {
    console.log('No Slack credentials set (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID, or SLACK_WEBHOOK_URL), skipping.');
    process.exit(0);
  }
  const run = JSON.parse(fs.readFileSync(process.argv[2] ?? 'run.json', 'utf8'));
  (async () => {
    const history = await loadHistory(process.env.DASHBOARD_URL);
    const threaded = Boolean(botToken && channel);
    const payload = buildMessage(run, { ...process.env, THREAD: threaded }, history);
    await send(payload, threaded ? buildThread(run) : null, { webhook, botToken, channel });
    console.log(`Slack notification sent (history: ${history.length} runs${threaded ? ', thread reply included' : ''}).`);
  })().catch((err) => { console.error(err.message); process.exit(1); });
}
