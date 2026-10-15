/* global Response, crypto, TextEncoder, URLSearchParams, fetch, console */
// Cloudflare Worker: receives the Slack /qa-run slash command, verifies it really
// came from Slack, and starts the GitHub Actions workflow.
//
// Secrets (set with `wrangler secret put`, never committed):
//   SLACK_SIGNING_SECRET  Slack app -> Basic Information -> Signing Secret
//   GITHUB_TOKEN          fine-grained PAT, this repo only, "Actions: read & write"
// Plain vars (wrangler.toml): GITHUB_REPO, GITHUB_REF, WORKFLOW_FILE,
//   ALLOWED_CHANNEL_IDS (optional), ALLOWED_USER_IDS (optional)

const HELP = [
  '*Usage*',
  '`/qa-run smoke`  – fast critical-journey check',
  '`/qa-run full`  – full regression',
  '`/qa-run tag @critical`  – only tests with a tag (@smoke, @critical, @high, @medium, @low)',
].join('\n');

const reply = (text, inChannel = false) =>
  new Response(JSON.stringify({ response_type: inChannel ? 'in_channel' : 'ephemeral', text }), {
    headers: { 'Content-Type': 'application/json' },
  });

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

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });

    const body = await request.text();
    const ok = await validSignature(
      env.SLACK_SIGNING_SECRET,
      request.headers.get('x-slack-request-timestamp'),
      body,
      request.headers.get('x-slack-signature'),
    );
    if (!ok) return new Response('Invalid signature', { status: 401 });

    const form = new URLSearchParams(body);
    const userId = form.get('user_id');
    const userName = form.get('user_name');
    const channelId = form.get('channel_id');
    const text = (form.get('text') ?? '').trim();

    const allowedChannels = (env.ALLOWED_CHANNEL_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const allowedUsers = (env.ALLOWED_USER_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (allowedChannels.length && !allowedChannels.includes(channelId)) return reply(':no_entry: /qa-run can only be used in the QA channel.');
    if (allowedUsers.length && !allowedUsers.includes(userId)) return reply(':no_entry: You are not allowed to start test runs.');

    const [cmd = 'help', ...rest] = text.split(/\s+/);
    const inputs = { requested_by: `@${userName}` };
    let label;
    if (cmd === 'smoke') { inputs.suite = 'smoke'; label = 'smoke suite'; }
    else if (cmd === 'full') { inputs.suite = 'full'; label = 'full regression'; }
    else if (cmd === 'tag' && /^@[A-Za-z0-9_-]{1,40}$/.test(rest[0] ?? '') && rest.length === 1) { inputs.grep = rest[0]; label = `tests tagged ${rest[0]}`; }
    else return reply(HELP);

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'qa-run-slack-relay',
      },
      body: JSON.stringify({ ref: env.GITHUB_REF || 'main', inputs }),
    });

    if (res.status !== 204) {
      console.log('GitHub dispatch failed', res.status, await res.text()); // visible in `wrangler tail`, not in Slack
      return reply(':x: Could not start the run. Check the relay logs / token permissions.');
    }
    return reply(`:rocket: <@${userId}> started the *${label}*. Results will be posted here when it finishes.`, true);
  },
};
