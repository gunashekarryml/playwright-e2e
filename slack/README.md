# Slack integration

Two independent pieces. Neither needs a secret to be committed or shared.

| Piece | What it does | Needs |
|---|---|---|
| **Results → Slack** | After each non-PR run, `notify-slack` posts a summary to a channel | Incoming-webhook URL, stored as a GitHub secret |
| **Slack → build** | `/qa-run smoke \| full \| tag @critical` starts the workflow | A tiny relay (Cloudflare Worker, free) holding the Slack signing secret + a GitHub token |

> GitHub can't receive Slack commands directly, which is why the relay exists. It only verifies the
> request came from Slack, validates the arguments, and calls GitHub's `workflow_dispatch` API.

## Where secrets live (never paste them in chat, code or commits)

| Secret | Created in | Stored in |
|---|---|---|
| Webhook URL | Slack app → Incoming Webhooks | GitHub repo secret `SLACK_WEBHOOK_URL` |
| Signing secret | Slack app → Basic Information | Cloudflare Worker secret `SLACK_SIGNING_SECRET` |
| GitHub token | GitHub → Settings → Developer settings → Fine-grained tokens | Cloudflare Worker secret `GITHUB_TOKEN` |

You type each one only into the secret store's own prompt/field.

## Simplest way to start a build from Slack (no server, no extra secrets)
Every result message has a **▶ Run again** button that opens GitHub's *Run workflow* page for this repo:
pick `suite` = smoke or full (or type a `grep` tag) and click **Run workflow**. The result then posts back to the channel,
naming who started it. For a first run, pin the same link in the channel (channel → Bookmarks → Add a link):
`https://github.com/gunashekarryml/playwright-e2e/actions/workflows/playwright.yml`.
It needs GitHub access, which is also the permission control. Use the `/qa-run` relay below only if people without GitHub access must start runs.

## Already have a bot token and channel ID?
Use these instead of a webhook (step 1 below becomes optional):
1. Token must start with `xoxb-` (Bot User OAuth Token) and the app needs the `chat:write` scope; run `/invite @YourBot` in the channel.
2. GitHub repo → Settings → Secrets and variables → Actions:
   - **Secrets** tab → `SLACK_BOT_TOKEN` = the token
   - **Variables** tab → `SLACK_CHANNEL_ID` = the channel ID (starts with `C`; not secret)
3. Done. If both a bot token and a webhook are set, the bot token is used.

Note: the token alone can't power `/qa-run`. That also needs the app's **Signing Secret** (section 2c).

## 1. Create the Slack app (5 min)

1. https://api.slack.com/apps → **Create New App → From scratch** → name it `QA Bot`, pick your workspace.
2. **Incoming Webhooks** → turn on → **Add New Webhook to Workspace** → choose the QA channel → copy the URL.
3. Add it to GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SLACK_WEBHOOK_URL`, Value: the URL.

That's all you need for **results in Slack**. The next run on `main` (or any manual run) posts a message.
Without the secret the notify job is skipped, so nothing breaks.

## 2. Trigger builds from Slack

### a) GitHub token (least privilege)
GitHub → Settings → Developer settings → **Fine-grained personal access tokens → Generate**
- Repository access: **Only select repositories → `playwright-e2e`**
- Permissions: **Actions: Read and write** (nothing else)
- Expiry: 90 days (set a calendar reminder). Keep the token in the clipboard only until step (c).

### b) Deploy the relay
```bash
cd slack/worker
npx wrangler login
npx wrangler deploy                      # prints https://qa-run-slack-relay.<you>.workers.dev
```

### c) Store the two secrets (wrangler prompts; nothing is echoed or saved to disk)
```bash
npx wrangler secret put GITHUB_TOKEN           # paste the token
npx wrangler secret put SLACK_SIGNING_SECRET   # paste Slack → Basic Information → Signing Secret
```

### d) Add the slash command
Slack app → **Slash Commands → Create New Command**
- Command: `/qa-run`
- Request URL: the Worker URL from (b)
- Short description: `Run the Playwright suite`, usage hint: `smoke | full | tag @critical`
- Then **Install App** (reinstall to workspace) and `/invite @QA Bot` into the QA channel.

### e) Lock it down (recommended)
In `slack/worker/wrangler.toml` set `ALLOWED_CHANNEL_IDS` (channel → right-click → *View details* → ID at the
bottom, starts with `C`) and optionally `ALLOWED_USER_IDS` (profile → ⋯ → *Copy member ID*, starts with `U`), then `npx wrangler deploy`.
These IDs are identifiers, not secrets, so they can be committed.

## Using it

```
/qa-run smoke            fast critical-journey check (~minutes)
/qa-run full             full regression
/qa-run tag @critical    only tests carrying that tag
/qa-run                  help
```
Slack replies "🚀 @you started the smoke suite", and when the workflow finishes the channel gets the result
(pass rate, failures by severity, top failing checks, links to the CI run, dashboard and Allure).

## Safety notes
- Requests are rejected unless the Slack signature is valid and under 5 minutes old.
- Only `smoke`, `full` and a single `@tag` are accepted, so free text never reaches a shell. The workflow also passes inputs through environment variables.
- The GitHub token can only run workflows in this one repo. If it leaks, revoke it in GitHub and run `wrangler secret put GITHUB_TOKEN` again.
- Slack-started runs get their own concurrency group, so they don't cancel a push-triggered run (and vice versa).
- Debug the relay with `npx wrangler tail`.
