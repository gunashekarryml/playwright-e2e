# Slack integration: setup and operations guide

This guide covers everything needed to run the QA Slack integration: how it works, one-time setup, daily use, security and troubleshooting.

**Never paste a secret into chat, a ticket, code or a commit.** Each secret goes only into the secret store named in this guide.

## 1. What it does

| Capability | What the team gets |
|---|---|
| **Results in Slack** | After every run on `main` and every manual or scheduled run, a colour-coded message with a Go / Conditional / No-Go verdict, pass rate, severity table, failing checks and links |
| **Start a run from Slack** | `/qa-run` opens a form (environment, suite, tag). Mentions, a shortcut and an App Home tab do the same |
| **Start a run from GitHub** | Actions → *Playwright E2E Tests* → *Run workflow*, with the same dropdowns |

### How the pieces connect
```
 Slack  --/qa-run, form, @mention-->  Cloudflare Worker (relay)  --workflow_dispatch-->  GitHub Actions
   ^                                  (verifies Slack signature)                              |
   |                                                                                          v
   +--------------- result message (bot token + channel ID) <------ notify-slack job <---- test jobs
```
- **Results flow** needs only a Slack bot token and a channel ID. No relay.
- **Run-from-Slack flow** needs the relay, because GitHub cannot receive Slack commands directly. The relay checks the request is really from Slack, validates the options and calls GitHub's API.

### Files
| File | Purpose |
|---|---|
| `scripts/notify-slack.js` | Builds and posts the result message |
| `slack/worker/index.js`, `wrangler.toml` | The relay (Cloudflare Worker) |
| `slack/app-manifest-initial.yml` | Slack app config for first creation |
| `slack/app-manifest.yml` | Full Slack app config (adds event subscriptions) |
| `slack/preview/render.js` | Renders sample messages to PNG (`node slack/preview/render.js`) |
| `.github/workflows/playwright.yml` | Workflow inputs and the `notify-slack` job |

## 2. Prerequisites
- Slack workspace where you can create apps. If your company requires **admin approval** for apps, start the request first (section 10).
- GitHub admin access to this repository (to add secrets and variables).
- A free Cloudflare account: https://dash.cloudflare.com/sign-up
- Node.js 20 or later on your machine.

## 3. Where each secret lives

| Secret | Looks like | Created in | Stored in |
|---|---|---|---|
| Slack bot token | `xoxb-…` | Slack app → OAuth & Permissions | GitHub secret `SLACK_BOT_TOKEN` **and** relay secret `SLACK_BOT_TOKEN` |
| Slack signing secret | 32 hex characters | Slack app → Basic Information → App Credentials | Relay secret `SLACK_SIGNING_SECRET` |
| GitHub token | `github_pat_…` | GitHub → Settings → Developer settings → Fine-grained tokens | Relay secret `GITHUB_TOKEN` |
| Slack channel ID | `C0123456789` (not a secret) | Channel → View details (bottom) | GitHub variable `SLACK_CHANNEL_ID`, `wrangler.toml` |

Relay secrets are set with `npx wrangler secret put <NAME>`. The prompt hides what you paste. List what is stored with `npx wrangler secret list` (names only).

## 4. Part A: results in Slack (about 10 minutes)

1. Make sure you have a Slack app with a bot token (`xoxb-…`) and the `chat:write` scope. Section 6 creates one.
2. In the QA channel, type `/invite @QA Bot`.
3. In GitHub: repo → **Settings → Secrets and variables → Actions**
   - **Secrets** tab → `SLACK_BOT_TOKEN` = the bot token
   - **Variables** tab → `SLACK_CHANNEL_ID` = the channel ID
4. Run the workflow once (Actions → *Run workflow*). A message should arrive in the channel.

Alternative without a bot: add an incoming webhook to the channel and store its URL as the GitHub secret `SLACK_WEBHOOK_URL`. If both are set, the bot token is used.

## 5. Part B: deploy the relay (about 10 minutes)

1. Create the GitHub token for the relay:
   - GitHub → profile photo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Name `qa-run-slack-relay`, expiry 90 days
   - Repository access: **Only select repositories** → this repo
   - Permissions → Repository → **Actions: Read and write** (nothing else)
2. Deploy:
   ```bash
   cd slack/worker
   npx wrangler login      # opens a browser; click Allow
   npx wrangler deploy
   ```
   On first use Wrangler asks you to register a `workers.dev` subdomain. Accept, and pick a neutral name.
3. Note the address it prints, like `https://qa-run-slack-relay.<subdomain>.workers.dev`.
4. Check it is live: open that address in a browser. **"Not found" is the correct response.**
5. Edit `slack/worker/wrangler.toml`:
   ```toml
   GITHUB_REPO = "<owner>/<repo>"
   RESULT_CHANNEL_ID = "C0123456789"     # where "run started" messages go
   ALLOWED_CHANNEL_IDS = "C0123456789"   # only this channel can start runs (recommended)
   ALLOWED_USER_IDS = ""                 # optional: only these people (IDs start with U)
   DASHBOARD_URL = ""                    # optional: shown on the App Home tab
   ```
   Then run `npx wrangler deploy` again.
6. Store the secrets (paste each value at the prompt):
   ```bash
   npx wrangler secret put GITHUB_TOKEN           # github_pat_…
   npx wrangler secret put SLACK_SIGNING_SECRET   # 32 hex characters
   npx wrangler secret put SLACK_BOT_TOKEN        # xoxb-…  (after step 6.4 below)
   ```
   Do not include quotes, spaces or the word "Bearer".

## 6. Part C: create the Slack app

The order matters. Slack verifies the `/events` address with a signed test request, and the relay can only check that signature once it has the signing secret. So create the app **without** event subscriptions first, then add them.

1. Open https://api.slack.com/apps → **Create New App** → **From a manifest** → pick the workspace → **YAML**.
2. Paste `slack/app-manifest-initial.yml`. Replace `qa-run-slack-relay.ct-automation-gs.workers.dev` with your relay address if it differs (no `https://`). Click **Next → Create**.
3. **OAuth & Permissions** → **Install to Workspace** (or **Request to Workspace Install** if approval is required; see section 10). Leave Token Rotation and PKCE off.
4. After installation, copy the **Bot User OAuth Token** (`xoxb-…`) and store it (section 5, step 6, and the GitHub secret in section 4).
5. **Basic Information → App Credentials → Signing Secret → Show** → copy it and store it in the relay (section 5, step 6).
6. **App Manifest** (left sidebar) → replace the contents with `slack/app-manifest.yml` → **Save Changes**. Slack verifies `/events`; a clean save means the relay and signing secret are correct.
7. In the QA channel: `/invite @QA Bot`.

## 7. Part D: GitHub configuration

Repo → **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|---|---|
| `QA_URL`, `DEV_URL`, `STAGING_URL`, `PROD_URL` | Site URL for each environment. If one is missing, the run falls back to `BASE_URL`, then to https://www.saucedemo.com |
| `SLACK_CHANNEL_ID` | QA channel ID |
| `SLACK_RUN_FORM` | `true` makes the result message's button open the Slack form. Leave unset to link to GitHub's *Run workflow* page instead |

Secret: `SLACK_BOT_TOKEN` (section 4).

Only QA or default runs on `main` update the published Allure report and dashboard history. Other environments still post to Slack.

## 8. Using it

### The run form
| Field | Options | Default | Required |
|---|---|---|---|
| Environment | QA, DEV, STAGING, PROD | PROD | Yes |
| Suite | **Run type:** Smoke, Full Regression. **Specific feature:** Login, Product Listing, Product Details, Cart, Checkout, Menu & Navigation, Dynamic Catalog, Accessibility, User Profiles | Smoke | Yes |
| Only tests tagged | @smoke, @critical, @high, @medium, @low | none | No |

A tag narrows the suite: *Checkout* + *@critical* runs only the critical checkout tests. Feature runs are labelled *partial* in Slack and the dashboard and are excluded from the release verdict, which always uses the latest full regression.

### Ways to start a run
| How | What happens |
|---|---|
| `/qa-run` | Opens the form: **Environment** (QA, DEV, STAGING, PROD), **Suite** (Smoke or Full Regression), optional **tag** |
| `/qa-run smoke`, `/qa-run full`, `/qa-run tag @critical` | Starts a QA run immediately |
| `@QA Bot run smoke on QA`, `@QA Bot full on STAGING`, `@QA Bot tag @critical on DEV` | Plain-text start; the bot replies in the thread |
| ⚡ menu → **Run QA tests** | Opens the form from any channel |
| **Home** tab of the app | **Run QA tests** button and the 5 most recent runs |
| GitHub → Actions → *Run workflow* | Same options in GitHub; the branch comes from the "Use workflow from" dropdown |

PROD runs complete real checkouts. Only run PROD with tests that are safe for production.

### Reading the result message
- **Header and context line:** a coloured status dot, the headline ("Release with caution") and the run number; below it the verdict, environment, suite, who started it and the runtime.
- **Pass rate:** a big number with the change since the previous run (▲/▼ pts), a coloured meter against the target, and a sparkline of the last 8 runs. The trend comes from the dashboard's `data/runs.json`; if it can't be read, the message still posts without it.
- **Reason:** one plain sentence on why the verdict is what it is.
- **Release checks:** "7 of 8 passed". Only the checks that need attention get a tile; the passing ones fold into a single line.
- **By severity / By feature:** terminal-style bars (weakest feature first), plus the four browsers.
- **Needs attention:** the 3 most serious distinct issues with a plain-language cause. With a bot token, the **full list** of issues and unstable checks, with expected vs actual, owner and next step, is posted as a **thread reply** so the channel stays short.
- **Next step** and **buttons:** Dashboard, Allure report, CI run, and Run again (or Configure & run).

To preview layouts without posting: `node slack/preview/render.js` writes PNGs to `slack/preview/`.

## 9. Verification checklist

- [ ] Relay address shows "Not found" in a browser
- [ ] `npx wrangler secret list` shows `SLACK_SIGNING_SECRET`, `GITHUB_TOKEN`, `SLACK_BOT_TOKEN`
- [ ] Slack app saved the full manifest without an `/events` error
- [ ] Bot is in the channel
- [ ] A manual workflow run posts a result message
- [ ] `/qa-run` opens the form; Submit starts a run and posts "🚀 started …"
- [ ] `@QA Bot run smoke on QA` replies in the thread
- [ ] App Home tab shows the Run button and recent runs

## 10. Admin approval

If installation needs approval, click **Request to Workspace Install** and send your admin a short note: the bot posts test results to one channel and lets the QA team start runs; it needs `chat:write`, `commands` and `app_mentions:read`; it does not read or store channel messages.

The manifest also lists `channels:history`, `users:read`, `users:read.email` and `reactions:write`. **They are not used yet.** Delete them from both manifests before requesting approval if you want the smallest request, because adding a scope later requires approval again.

Changes that need **no** new approval: relay address, app name or description, command text, secret rotation. Changes that do: adding scopes, new slash commands or new bot features.

## 11. Security model

- Every request to the relay must carry a valid Slack signature, and requests older than five minutes are rejected.
- Only fixed lists are accepted for environment, suite and tag, so free text never reaches a shell. The workflow also passes inputs through environment variables.
- `ALLOWED_CHANNEL_IDS` and `ALLOWED_USER_IDS` limit who can start runs.
- The GitHub token can only run workflows in one repository.
- The relay stores no Slack data. Secrets are in Cloudflare and GitHub secret stores only.
- Slack-started and manual runs use their own concurrency group, so they do not cancel push-triggered runs.

## 12. Maintenance

| Task | When | How |
|---|---|---|
| Renew the GitHub token | Before it expires (90 days) | Create a new fine-grained token, `npx wrangler secret put GITHUB_TOKEN`, delete the old one |
| Rotate Slack secrets | If someone with access leaves, or a leak | Slack: regenerate the signing secret or reinstall for a new bot token; update the relay and GitHub secrets |
| Change the relay | When editing `slack/worker/` | `cd slack/worker && npx wrangler deploy` |
| Add an environment | New environment | Add it to the workflow's `environment` options, the relay's `ENVIRONMENTS` list, and a repo variable for its URL |
| Add a collaborator | So the app does not depend on one person | Slack app → Collaborators |
| Debug the relay | Any relay problem | `cd slack/worker && npx wrangler tail`, then reproduce |

## 13. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Result message missing; job log says `not_in_channel` | Bot is not in the channel. Run `/invite @QA Bot` |
| `channel_not_found` | `SLACK_CHANNEL_ID` is wrong, or it is a private channel the bot is not in. Use the ID, not the name |
| `missing_scope` | Add the scope in the Slack app and reinstall |
| `invalid_auth` | Bot token is wrong or revoked. Store the new token in GitHub and the relay |
| Notify job skipped | No Slack credentials set. Add `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` (or `SLACK_WEBHOOK_URL`) |
| Slack says the app did not respond | Request URLs in the app are wrong. They must end in `/command`, `/interactivity`, `/events` |
| `/events` fails to save | Signing secret not stored, or wrong value. Run `wrangler secret put SLACK_SIGNING_SECRET`, then save again |
| "Could not open the form" | `SLACK_BOT_TOKEN` missing in the relay |
| "Could not start the run" | GitHub token expired or lacks Actions read/write on this repo. Check `wrangler tail` |
| "Invalid signature" in `wrangler tail` | Wrong signing secret, or the request did not come from Slack |
| Environment URL ignored | Variable names must match exactly (`QA_URL`, …) and be under **Variables**, not Secrets |
| Run does not start from Slack but works from GitHub | Workflow input names or options changed. They must match the relay's lists |
