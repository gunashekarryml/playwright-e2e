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

// Must match the workflow_dispatch choice options in .github/workflows/playwright.yml
const ENVIRONMENTS = ['QA', 'DEV', 'STAGING', 'PROD'];
const SUITES = ['Smoke', 'Full Regression'];
const TAGS = ['@smoke', '@critical', '@high', '@medium', '@low'];

const HELP = [
  '*Usage*',
  '`/qa-run`  – open the form (environment, suite, tag)',
  '`/qa-run smoke`  /  `/qa-run full`  – quick start on QA',
  '`/qa-run tag @critical`  – only tests with that tag',
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

const opt = (v) => ({ text: { type: 'plain_text', text: v }, value: v });

function formView(channel) {
  return {
    type: 'modal',
    callback_id: 'qa_run',
    private_metadata: channel ?? '',
    title: { type: 'plain_text', text: 'Run QA tests' },
    submit: { type: 'plain_text', text: '🚀 Start run' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'input', block_id: 'env_b', label: { type: 'plain_text', text: 'Environment' }, element: { type: 'static_select', action_id: 'env', initial_option: opt('QA'), options: ENVIRONMENTS.map(opt) } },
      { type: 'input', block_id: 'suite_b', label: { type: 'plain_text', text: 'Suite' }, element: { type: 'radio_buttons', action_id: 'suite', initial_option: { ...opt('Full Regression'), description: { type: 'plain_text', text: 'Every test, all browsers' } }, options: [{ ...opt('Smoke'), description: { type: 'plain_text', text: 'Critical journeys only — fastest' } }, { ...opt('Full Regression'), description: { type: 'plain_text', text: 'Every test, all browsers' } }] } },
      { type: 'input', block_id: 'tag_b', optional: true, label: { type: 'plain_text', text: 'Only tests tagged (optional)' }, hint: { type: 'plain_text', text: 'Overrides the suite when set.' }, element: { type: 'static_select', action_id: 'tag', placeholder: { type: 'plain_text', text: 'No tag filter' }, options: TAGS.map(opt) } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ *PROD* runs real checkouts against production. Results are posted back to this channel.' }] },
    ],
  };
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

const describe = (i) => `*${i.grep ? `tests tagged ${i.grep}` : i.suite}* on *${i.environment}*`;
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
  const inputs = { environment: 'QA', requested_by: `@${userName}` };
  if (cmd === 'smoke') inputs.suite = 'Smoke';
  else if (cmd === 'full') inputs.suite = 'Full Regression';
  else if (cmd === 'tag' && rest.length === 1 && TAGS.includes(rest[0])) { inputs.suite = 'Full Regression'; inputs.grep = rest[0]; }
  else return ephemeral(HELP);

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
  if (payload.type === 'block_actions') return new Response('');

  if (payload.type === 'view_submission' && payload.view?.callback_id === 'qa_run') {
    const channel = payload.view.private_metadata || homeChannel(env);
    const denied = allowed(env, userId, channel);
    if (denied) return json({ response_action: 'errors', errors: { env_b: denied.replace(/:\w+: /, '') } });

    const v = payload.view.state.values;
    const environment = v.env_b?.env?.selected_option?.value;
    const suite = v.suite_b?.suite?.selected_option?.value;
    const tag = v.tag_b?.tag?.selected_option?.value;
    if (!ENVIRONMENTS.includes(environment)) return json({ response_action: 'errors', errors: { env_b: 'Pick an environment.' } });
    if (!SUITES.includes(suite)) return json({ response_action: 'errors', errors: { suite_b: 'Pick a suite.' } });
    if (tag && !TAGS.includes(tag)) return json({ response_action: 'errors', errors: { tag_b: 'Unknown tag.' } });

    const inputs = { environment, suite, requested_by: `@${payload.user.username ?? payload.user.name ?? userId}` };
    if (tag) inputs.grep = tag;
    if (!(await dispatch(env, inputs))) return json({ response_action: 'errors', errors: { env_b: 'Could not start the run. Ask an admin to check the relay logs.' } });

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
  const environment = ENVIRONMENTS.find((e) => new RegExp(`\\b${e.toLowerCase()}\\b`).test(t)) ?? 'QA';
  const tag = TAGS.find((x) => t.includes(x));
  const suite = /\bsmoke\b/.test(t) ? 'Smoke' : /\b(full|regression)\b/.test(t) ? 'Full Regression' : null;
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
  if (!inputs) return post('Try: `@QA Bot run smoke on QA`, `@QA Bot full on STAGING`, or `@QA Bot tag @critical on DEV`. Or use `/qa-run` for the form.');
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
