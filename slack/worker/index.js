/* global Response, crypto, TextEncoder, URLSearchParams, URL, fetch, console */
// Cloudflare Worker: Slack -> GitHub Actions relay.
//   POST /command        Slack slash command  (/qa-run)           -> opens the "Run QA tests" form
//   POST /interactivity  form Submit, buttons, the ⚡ shortcut     -> opens the form / starts the workflow
//   POST /events         @QA Bot mentions + App Home tab           -> "run smoke on qa" in plain text, home dashboard
//
// Secrets (set with `wrangler secret put`, never committed):
//   SLACK_SIGNING_SECRET  Slack app -> Basic Information -> Signing Secret
//   SLACK_BOT_TOKEN       Slack app -> OAuth & Permissions -> Bot User OAuth Token (xoxb-...)
//   GITHUB_TOKEN          fine-grained PAT, this repo only, "Actions: read & write"
// Plain vars (wrangler.toml): GITHUB_REPO, GITHUB_REF, WORKFLOW_FILE, ALLOWED_CHANNEL_IDS, ALLOWED_USER_IDS,
//   RESULT_CHANNEL_ID (where confirmations go when a run starts outside a channel: App Home / shortcut)

import TEST_MAP from './test-map.json'; // tags of every test (node scripts/gen-test-map.js): counts + empty-selection check

// Must match the workflow_dispatch choice options in .github/workflows/playwright.yml
const ENVIRONMENTS = ['QA', 'DEV', 'STAGING', 'PROD'];
const DEFAULT_ENV = 'PROD';
const RUN_TYPES = ['Smoke', 'Sanity', 'Full Regression'];
// Feature suites -> words people may type after /qa-run or in a mention (first match wins, so list specific names first)
const FEATURES = {
  'Product Details': ['product details', 'details'],
  'Product Listing': ['listing', 'inventory', 'products'],
  Login: ['login'],
  Cart: ['cart'],
  Checkout: ['checkout'],
  'Menu & Navigation': ['menu', 'navigation'],
  'Dynamic Catalog': ['catalog', 'dynamic'],
  Accessibility: ['accessibility', 'a11y'],
  'User Profiles': ['users', 'profiles'],
};
const TAGS = ['@smoke', '@sanity-login', '@critical', '@high', '@medium', '@low'];
const suiteFromText = (t) => {
  if (/\bsmoke\b/.test(t)) return 'Smoke';
  if (/\bsanity\b/.test(t)) return 'Sanity';
  for (const [suite, words] of Object.entries(FEATURES)) if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return suite;
  if (/\b(full|regression)\b/.test(t)) return 'Full Regression';
  return null;
};

const HELP = [
  '*Usage*',
  '`/qa-run`  – open the form (environment, run type, features, severity, browsers)',
  '`/qa-run smoke`  /  `full`  /  `checkout`  /  `cart`  /  `login` …  – quick start on PROD',
  '`/qa-run checkout tag @critical`  – a suite, only tests with that tag',
].join('\n');

const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const ephemeral = (text) => json({ response_type: 'ephemeral', text });

async function validSignature(secret, timestamp, body, signature) {
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // replay protection
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  const expected = `v0=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (expected.length !== signature.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const list = (v) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const allowed = (env, userId, channelId) => {
  const ch = list(env.ALLOWED_CHANNEL_IDS), us = list(env.ALLOWED_USER_IDS);
  if (channelId && ch.length && !ch.includes(channelId)) return ':no_entry: /qa-run can only be used in the QA channel.';
  if (us.length && !us.includes(userId)) return ':no_entry: You are not allowed to start test runs.';
  return null;
};

const homeChannel = (env, channel) => channel || env.RESULT_CHANNEL_ID || list(env.ALLOWED_CHANNEL_IDS)[0] || '';

async function slackApi(env, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.log(`Slack ${method} failed:`, data.error);
  return data;
}


// ---- the run form: Environment, Run type, Features, Severity, Browsers (+ PROD confirmation, summary, Advanced) ----
const RUN_INFO = {
  Smoke: { label: 'Smoke', desc: 'critical journeys, fastest', tag: 'smoke' },
  Sanity: { label: 'Sanity', desc: 'quick login check', tag: 'sanity-login' },
  'Full Regression': { label: 'Regression', desc: 'every test', tag: null },
};
const FEATURE_TAGS = { 'Product Details': 'product', 'Product Listing': 'inventory', Login: 'login', Cart: 'cart', Checkout: 'checkout', 'Menu & Navigation': 'menu', 'Dynamic Catalog': 'catalog', Accessibility: 'a11y', 'User Profiles': 'users' };
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const BROWSERS = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit', 'mobile-chrome': 'Mobile Chrome' };
const RETRIES = ['0', '1', '2'];
const FORM_ACTIONS = ['env', 'run', 'feat', 'sev', 'brw']; // changing these refreshes the summary
const FORM_DEFAULTS = { env: 'QA', runType: 'Smoke', features: [], severity: [], browsers: ['chromium'], retries: '', baseUrl: '', extra: '', confirm: false };

const plain = (text) => ({ type: 'plain_text', text });
const sel = (v, text = v, description) => ({ text: plain(text), value: v, ...(description ? { description: plain(description) } : {}) });
const picked = (values, all, mk) => { const o = all.filter((v) => values.includes(v)).map(mk); return o.length ? { initial_options: o } : {}; };

// the form's current answers (Slack gives them back as view.state.values)
function readState(values = {}) {
  const one = (b, a) => values[b]?.[a]?.selected_option?.value;
  const many = (b, a) => (values[b]?.[a]?.selected_options ?? []).map((o) => o.value);
  return {
    env: one('env_b', 'env') ?? FORM_DEFAULTS.env,
    runType: one('run_b', 'run') ?? FORM_DEFAULTS.runType,
    features: many('feat_b', 'feat'), severity: many('sev_b', 'sev'), browsers: many('brw_b', 'brw'),
    retries: one('retry_b', 'retry') ?? '',
    baseUrl: (values.url_b?.url?.value ?? '').trim(), extra: (values.tag_b?.tag?.value ?? '').trim(),
    confirm: many('conf_b', 'conf').length > 0,
  };
}

// every group must match; a test matches a group when it has any tag of it (Features and Severity are "any of", groups are "and")
const tagGroups = (st) => [
  [RUN_INFO[st.runType]?.tag].filter(Boolean),
  st.features.map((f) => FEATURE_TAGS[f]).filter(Boolean),
  st.severity,
  st.extra ? st.extra.split(',').map((t) => t.replace(/^@/, '')) : [],
].filter((g) => g.length);
const matchCount = (st) => { const g = tagGroups(st); return TEST_MAP.filter((tags) => g.every((grp) => grp.some((t) => tags.includes(t)))).length; };
// the run's own filter (the run type is sent as the suite): "@login,@cart @critical" = (login or cart) and critical
const grepOf = (st) => tagGroups({ ...st, runType: 'Full Regression' }).map((g) => g.map((t) => `@${t}`).join(',')).join(' ');
const browserNames = (b) => b.map((x) => BROWSERS[x]).join(', ');

function summaryText(st) {
  const n = matchCount(st);
  return [
    `*Will run:* ${RUN_INFO[st.runType].label} · ${st.features.join(', ') || 'all features'} · ${st.severity.join(', ') || 'all severities'} · on *${st.env}* · ${browserNames(st.browsers) || 'no browser'}`,
    n ? `≈ ${n} test${n > 1 ? 's' : ''} per browser` : ':x: *0 tests match.* Remove a filter, e.g. clear Severity or Features.',
  ].join('\n');
}

function formView(channel, st = FORM_DEFAULTS) {
  const input = (block_id, label, element, extra = {}) => ({ type: 'input', block_id, label: plain(label), element, ...extra });
  return {
    type: 'modal',
    callback_id: 'qa_run',
    private_metadata: channel ?? '',
    title: plain('Run QA tests'),
    submit: plain('🚀 Start run'),
    close: plain('Cancel'),
    blocks: [
      input('env_b', 'Environment *', { type: 'radio_buttons', action_id: 'env', options: ENVIRONMENTS.map((e) => sel(e)), initial_option: sel(st.env) }, { dispatch_action: true }),
      input('run_b', 'Run type *', { type: 'radio_buttons', action_id: 'run', options: RUN_TYPES.map((r) => sel(r, RUN_INFO[r].label, RUN_INFO[r].desc)), initial_option: sel(st.runType, RUN_INFO[st.runType].label, RUN_INFO[st.runType].desc) }, { dispatch_action: true }),
      input('feat_b', 'Features (optional · none = all)', { type: 'multi_static_select', action_id: 'feat', placeholder: plain('All features'), options: Object.keys(FEATURE_TAGS).map((f) => sel(f)), ...picked(st.features, Object.keys(FEATURE_TAGS), (f) => sel(f)) }, { optional: true, dispatch_action: true }),
      input('sev_b', 'Severity (optional · none = all)', { type: 'checkboxes', action_id: 'sev', options: SEVERITIES.map((v) => sel(v, v[0].toUpperCase() + v.slice(1))), ...picked(st.severity, SEVERITIES, (v) => sel(v, v[0].toUpperCase() + v.slice(1))) }, { optional: true, dispatch_action: true }),
      input('brw_b', 'Browsers *', { type: 'checkboxes', action_id: 'brw', options: Object.entries(BROWSERS).map(([v, t]) => sel(v, t)), ...picked(st.browsers, Object.keys(BROWSERS), (v) => sel(v, BROWSERS[v])) }, { dispatch_action: true, hint: plain('Chromium is the default; add others only when you need them.') }),
      ...(st.env === 'PROD' ? [
        { type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ *PROD runs real checkouts against production.*' }] },
        input('conf_b', 'Production *', { type: 'checkboxes', action_id: 'conf', options: [sel('yes', 'I understand, run against PROD')], ...(st.confirm ? { initial_options: [sel('yes', 'I understand, run against PROD')] } : {}) }),
      ] : []),
      { type: 'section', text: { type: 'mrkdwn', text: summaryText(st) } },
      { type: 'divider' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '*Advanced* (optional)' }] },
      input('url_b', 'Environment URL override', { type: 'plain_text_input', action_id: 'url', placeholder: plain('https://… (default: the environment\'s own URL)'), ...(st.baseUrl ? { initial_value: st.baseUrl } : {}) }, { optional: true }),
      input('retry_b', 'Retries', { type: 'static_select', action_id: 'retry', placeholder: plain('Default'), options: RETRIES.map((r) => sel(r)), ...(st.retries ? { initial_option: sel(st.retries) } : {}) }, { optional: true }),
      input('tag_b', 'Extra tag filter', { type: 'plain_text_input', action_id: 'tag', placeholder: plain('@critical or @cart,@checkout'), ...(st.extra ? { initial_value: st.extra } : {}) }, { optional: true, hint: plain('Narrows the selection above. Commas mean "or".') }),
    ],
  };
}

// rebuilds the form from its current answers (live summary, PROD confirmation)
async function refreshForm(payload, env) {
  const st = readState(payload.view.state.values);
  await slackApi(env, 'views.update', { view_id: payload.view.id, hash: payload.view.hash, view: formView(payload.view.private_metadata, st) });
}

async function dispatch(env, inputs) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'qa-run-slack-relay' },
    body: JSON.stringify({ ref: env.GITHUB_REF || 'main', inputs }),
  });
  if (res.status !== 204) console.log('GitHub dispatch failed', res.status, await res.text()); // in `wrangler tail`, never in Slack
  return res.status === 204;
}

const describe = (i) => `*${i.suite}${i.grep ? ` · ${i.grep}` : ''}* on *${i.environment}*`;
const actionsUrl = (env) => `https://github.com/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}`;

async function handleCommand(form, env) {
  const userId = form.get('user_id'), channelId = form.get('channel_id'), userName = form.get('user_name');
  const denied = allowed(env, userId, channelId);
  if (denied) return ephemeral(denied);

  const [cmd = '', ...rest] = (form.get('text') ?? '').trim().split(/\s+/);
  if (cmd === '' || cmd === 'form') {
    const r = await slackApi(env, 'views.open', { trigger_id: form.get('trigger_id'), view: formView(channelId) });
    return r.ok ? new Response('') : ephemeral(':x: Could not open the form. Check the relay logs (is SLACK_BOT_TOKEN set?).');
  }
  const inputs = { environment: DEFAULT_ENV, requested_by: `@${userName}` };
  const words = [cmd, ...rest].join(' ').toLowerCase();
  const tag = TAGS.find((t) => words.includes(t));
  const suite = suiteFromText(words.replace(/\btag\b/, ''));
  if (!suite && !tag) return ephemeral(HELP);
  inputs.suite = suite ?? 'Full Regression';
  if (tag) inputs.grep = tag;

  if (!(await dispatch(env, inputs))) return ephemeral(':x: Could not start the run. Check the relay logs / token permissions.');
  return json({ response_type: 'in_channel', text: `🚀 <@${userId}> started ${describe(inputs)}. Results will be posted here when it finishes.` });
}

async function handleInteractivity(payload, env, ctx) {
  const userId = payload.user?.id;

  // "Configure & run" button (result message / App Home) or the ⚡ global shortcut
  if (payload.type === 'shortcut' || (payload.type === 'block_actions' && payload.actions?.[0]?.action_id === 'qa_open_form')) {
    if (!allowed(env, userId, payload.channel?.id)) {
      await slackApi(env, 'views.open', { trigger_id: payload.trigger_id, view: formView(homeChannel(env, payload.channel?.id)) });
    }
    return new Response('');
  }
  if (payload.type === 'block_actions') {
    if (payload.view?.callback_id === 'qa_run' && FORM_ACTIONS.includes(payload.actions?.[0]?.action_id)) await refreshForm(payload, env);
    return new Response('');
  }

  if (payload.type === 'view_submission' && payload.view?.callback_id === 'qa_run') {
    const channel = payload.view.private_metadata || homeChannel(env);
    const denied = allowed(env, userId, channel);
    if (denied) return json({ response_action: 'errors', errors: { env_b: denied.replace(/:\w+: /, '') } });

    const st = readState(payload.view.state.values);
    const err = (block, msg) => json({ response_action: 'errors', errors: { [block]: msg } });
    if (!ENVIRONMENTS.includes(st.env)) return err('env_b', 'Pick an environment.');
    if (!RUN_TYPES.includes(st.runType)) return err('run_b', 'Pick a run type.');
    if (st.features.some((f) => !FEATURE_TAGS[f])) return err('feat_b', 'Unknown feature.');
    if (st.severity.some((x) => !SEVERITIES.includes(x))) return err('sev_b', 'Unknown severity.');
    if (!st.browsers.length || st.browsers.some((x) => !BROWSERS[x])) return err('brw_b', 'Pick at least one browser.');
    if (st.env === 'PROD' && !st.confirm) return err('conf_b', 'Confirm to run against production.');
    if (st.baseUrl && !/^https:\/\/[^\s]+$/.test(st.baseUrl)) return err('url_b', 'Use a full https:// URL.');
    if (st.retries && !RETRIES.includes(st.retries)) return err('retry_b', 'Pick 0, 1 or 2.');
    if (st.extra && !/^@?[\w-]+(,@?[\w-]+)*$/.test(st.extra)) return err('tag_b', 'Use tags like @critical or @cart,@checkout.');
    if (!matchCount(st)) return err('feat_b', 'No tests match this combination. Remove a filter.');

    const inputs = { environment: st.env, suite: st.runType, browsers: JSON.stringify(Object.keys(BROWSERS).filter((x) => st.browsers.includes(x))), requested_by: `@${payload.user.username ?? payload.user.name ?? userId}` };
    const grep = grepOf(st);
    if (grep) inputs.grep = grep;
    if (st.baseUrl) inputs.base_url = st.baseUrl;
    if (st.retries) inputs.retries = st.retries;
    if (!(await dispatch(env, inputs))) return err('env_b', 'Could not start the run. Ask an admin to check the relay logs.');

    if (channel) {
      ctx.waitUntil(slackApi(env, 'chat.postMessage', { channel, text: `🚀 <@${userId}> started ${describe(inputs)}.`, blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `🚀 <@${userId}> started ${describe(inputs)}.\nResults will be posted here when it finishes.` }, accessory: { type: 'button', text: { type: 'plain_text', text: 'View run' }, url: actionsUrl(env) } },
      ] }));
    }
    return new Response(''); // empty 200 closes the form
  }
  return new Response('');
}

// ---- @QA Bot mentions: "run smoke on qa", "full on staging", "tag @critical on dev" ----
function parseMention(text) {
  const t = text.replace(/<@[A-Z0-9]+>/g, '').toLowerCase();
  const environment = ENVIRONMENTS.find((e) => new RegExp(`\\b${e.toLowerCase()}\\b`).test(t)) ?? DEFAULT_ENV;
  const tag = TAGS.find((x) => t.includes(x));
  const suite = suiteFromText(t);
  if (!suite && !tag) return null;
  const inputs = { environment, suite: suite ?? 'Full Regression' };
  if (tag) inputs.grep = tag;
  return inputs;
}

async function handleMention(event, env) {
  const post = (text) => slackApi(env, 'chat.postMessage', { channel: event.channel, thread_ts: event.thread_ts ?? event.ts, text });
  const denied = allowed(env, event.user, event.channel);
  if (denied) return post(denied);
  const inputs = parseMention(event.text ?? '');
  if (!inputs) return post('Try: `@QA Bot run smoke on PROD`, `@QA Bot checkout on QA`, or `@QA Bot full on STAGING @critical`. Or use `/qa-run` for the form.');
  inputs.requested_by = `<@${event.user}>`;
  if (!(await dispatch(env, inputs))) return post(':x: Could not start the run. Check the relay logs / token permissions.');
  return post(`🚀 Started ${describe(inputs)}. I'll post the result in the channel when it finishes.`);
}

// ---- App Home tab ----
const ICON = { success: '✅', failure: '❌', cancelled: '⚪', skipped: '⚪' };
async function publishHome(userId, env) {
  let runs = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/runs?per_page=5`, {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'qa-run-slack-relay' },
    });
    runs = r.ok ? (await r.json()).workflow_runs ?? [] : [];
  } catch { /* show the tab without runs */ }
  const lines = runs.map((x) => `${x.status !== 'completed' ? '🔄' : ICON[x.conclusion] ?? '⚪'} <${x.html_url}|Run #${x.run_number}> · ${x.event === 'workflow_dispatch' ? 'manual' : x.event} · ${x.head_branch}`);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🧪 QA Bot' } },
    { type: 'section', text: { type: 'mrkdwn', text: 'Start Playwright test runs and see recent results. Results are posted to the QA channel when a run finishes.' }, accessory: { type: 'button', style: 'primary', text: { type: 'plain_text', text: '▶️ Run QA tests' }, action_id: 'qa_open_form', value: 'open' } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*Recent runs*\n${lines.length ? lines.join('\n') : '_No runs found yet._'}` } },
    ...(env.DASHBOARD_URL ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '📊 Open dashboard' }, url: env.DASHBOARD_URL }] }] : []),
  ];
  return slackApi(env, 'views.publish', { user_id: userId, view: { type: 'home', blocks } });
}

async function handleEvents(body, env, ctx, retryNum) {
  let data;
  try { data = JSON.parse(body); } catch { return new Response('Bad payload', { status: 400 }); }
  if (data.type === 'url_verification') return json({ challenge: data.challenge });
  if (retryNum) return new Response(''); // Slack retries slow responses; we already handled the first delivery
  const ev = data.event ?? {};
  if (ev.type === 'app_mention' && !ev.bot_id) ctx.waitUntil(handleMention(ev, env));
  else if (ev.type === 'app_home_opened' && ev.tab !== 'messages') ctx.waitUntil(publishHome(ev.user, env));
  return new Response('');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });
    const { pathname } = new URL(request.url);

    const body = await request.text();
    const ok = await validSignature(env.SLACK_SIGNING_SECRET, request.headers.get('x-slack-request-timestamp'), body, request.headers.get('x-slack-signature'));
    if (!ok) return new Response('Invalid signature', { status: 401 });

    if (pathname === '/events') return handleEvents(body, env, ctx, request.headers.get('x-slack-retry-num'));

    const form = new URLSearchParams(body);
    if (pathname === '/interactivity') {
      let payload;
      try { payload = JSON.parse(form.get('payload') ?? ''); } catch { return new Response('Bad payload', { status: 400 }); }
      return handleInteractivity(payload, env, ctx);
    }
    return handleCommand(form, env);
  },
};
