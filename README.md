# Playwright E2E Sample (with Claude Code)

[![Playwright E2E Tests](https://github.com/gunashekarryml/playwright-e2e/actions/workflows/playwright.yml/badge.svg)](https://github.com/gunashekarryml/playwright-e2e/actions/workflows/playwright.yml)
[![Allure Report](https://img.shields.io/badge/Allure%20Report-view-blue)](https://gunashekarryml.github.io/playwright-e2e/)

A working end-to-end test suite you can run today, plus a repo layout that
Claude Code can extend on its own. It tests the public demo store
[saucedemo.com](https://www.saucedemo.com) — login, cart, and checkout flows —
using TypeScript and the Page Object Model.

## 1. Prerequisites

- Node.js 18+ and npm
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`), if you want Claude to drive this repo from your terminal

## 2. Project layout

```
playwright-e2e-sample/
├── CLAUDE.md                 # context Claude Code reads automatically
├── playwright.config.ts      # browsers, retries, reporters, base URL
├── eslint.config.mjs         # flat config: typescript-eslint + Playwright rules
├── global-setup.ts           # logs in once, saves storageState for reuse
├── pages/                    # Page Objects (locators + actions)
│   ├── LoginPage.ts
│   ├── InventoryPage.ts
│   ├── CartPage.ts
│   └── CheckoutPage.ts
├── fixtures/
│   ├── pageFixtures.ts       # injects Page Objects into `test`
│   └── testData.ts           # shared users/credentials
├── tests/
│   ├── login.spec.ts
│   ├── cart.spec.ts
│   ├── checkout.spec.ts
│   └── accessibility.spec.ts # axe-core scans on key pages
├── allure/
│   └── config.ts             # Allure environment info + defect categories
├── scripts/
│   ├── report-flaky.js         # flags retried tests in the CI job summary
│   ├── strip-language-label.js # drops the redundant "language" chip
│   └── brand-allure-report.js  # wordmark/favicon/tab-title branding
└── .github/workflows/playwright.yml
```

## 3. Set up from scratch

If you're starting a brand-new project rather than using this sample, this is
the sequence:

```bash
mkdir my-e2e-suite && cd my-e2e-suite
npm init -y
npm init playwright@latest    # scaffolds config, an example test, and CI
```

The `npm init playwright@latest` wizard asks: TypeScript or JavaScript,
test folder name, whether to add a GitHub Actions workflow, and whether to
install browsers now. This sample already answers all of those, so you can
skip the wizard and just run the install step below.

## 4. Install and run this sample

```bash
cd playwright-e2e-sample
npm install
npx playwright install --with-deps   # downloads Chromium/Firefox/WebKit

npm test                 # run everything, headless, all 4 projects
npm run test:ui          # interactive UI mode — best for authoring/debugging
npm run test:headed      # watch the browser while it runs
npx playwright show-report
```

A passing run produces `playwright-report/` (HTML report with traces,
screenshots, and video on failure) and `test-results/`.

Every run also writes raw results to `allure-results/` via the
`allure-playwright` reporter. To view them as an Allure report (requires a
[Java runtime](https://www.java.com) locally; GitHub Actions runners already
have one):

```bash
npm run report:allure:generate   # builds allure-report/ from allure-results/
npm run report:allure:open       # serves it in a browser
```

Every merge to `main` also publishes the merged Allure report to
**https://gunashekarryml.github.io/playwright-e2e/** automatically — see
`.github/workflows/playwright.yml`.

### Allure report customization

`npm run report:allure:generate` does three things in sequence (see the
script chain in `package.json`):

1. `scripts/strip-language-label.js` removes the `language: javascript`
   label `allure-playwright` stamps on every result (it has no config
   option to disable it) — one less redundant chip on every test page.
2. `allure generate` builds the report, reading:
   - `allure/config.ts` → `environment.properties` (Environment tab) and
     `categories.json` (Categories tab: Product defects / Test-framework
     defects / Environment issues / Ignored), wired in via the
     `allure-playwright` reporter's `environmentInfo`/`categories` options
     in `playwright.config.ts`.
   - `executor.json`, written by a CI-only step in `playwright.yml` (build
     number, link back to the GitHub Actions run, link to the published
     Pages report) — powers the Executions widget.
3. `scripts/brand-allure-report.js` injects a small "Code & Theory"
   wordmark, a monogram favicon, and a custom tab title via a linked
   `custom/custom.css` — deliberately CSS-only and scoped to `body`/
   scrollbar selectors rather than Allure's internal (minified, versioned)
   component classes, so it keeps working across Allure upgrades.

To swap the text wordmark for a real logo, drop `assets/logo.svg` or
`assets/logo.png` into the repo — the branding script already copies it
into the report's `custom/` folder; reference it from `custom.css` to
replace the `body::before` text with an `<img>`/background-image. Override
the wordmark text or accent color without code changes via
`ALLURE_BRAND_NAME` / `ALLURE_BRAND_ACCENT` env vars.

## 5. CI behavior

- **Smoke vs. full regression** — pull requests run only tests tagged
  `@smoke` (fast feedback); pushes to `main`, the nightly cron, and manual
  runs (`suite: full`) run everything. Tag a test with a second argument —
  `test('...', { tag: '@smoke' }, async (...) => { ... })` — to add it to the
  fast gate. Run the same subset locally with `npm run test:smoke`.
- **Authenticated session reuse** — `global-setup.ts` logs in once as
  `standard_user` and saves `storageState`; `cart.spec.ts` and
  `checkout.spec.ts` reuse it (`test.use({ storageState: ... })`) instead of
  repeating the login flow in every test. `login.spec.ts` itself stays
  unauthenticated since it's testing the login flow.
- **Accessibility checks** — `accessibility.spec.ts` runs an axe-core scan
  against login/inventory/cart/checkout and fails on any `critical` or
  `serious` violation (SauceDemo's few pre-existing `moderate` issues are
  left as-is rather than chased).
- **Flaky-test visibility** — `scripts/report-flaky.js` reads the JSON
  reporter output after each run and lists any test that only passed after
  a retry in that job's summary, so retries don't silently hide flakiness.
- **Lint & type-check gate** — a standalone `lint` job runs `tsc --noEmit`
  and `npm run lint` (ESLint, flat config in `eslint.config.mjs`) on every
  push/PR, independently of the browser test matrix. It combines
  `typescript-eslint`'s type-aware rules with `eslint-plugin-playwright`
  (catches missing `await`s, focused/skipped tests left in by accident,
  `page.waitForTimeout` usage, etc.). Run it locally with `npm run lint`
  (or `npm run lint:fix` for auto-fixable issues).

## 6. How Claude Code fits in

`CLAUDE.md` in this repo tells Claude the folder conventions (Page Object
pattern, where fixtures live, how specs should import `test`/`expect`) so
generated code matches the existing style instead of reinventing it. Point
Claude Code at this folder and it can:

- **Generate new tests from a description** — "Add a spec that verifies the
  cart persists after a page reload" — Claude reads the existing Page Objects
  and fixtures first, then writes a spec that fits the pattern.
- **Turn a recorded flow into a test** — run `npm run codegen` to record
  clicks in a real browser, paste the generated code to Claude, and ask it to
  refactor that into a Page Object + spec.
- **Debug a failing/flaky test** — point Claude at the trace file Playwright
  writes on failure (`npx playwright show-trace test-results/.../trace.zip`)
  or just ask it to run `npx playwright test --debug` and reason about the
  output.
- **Keep the suite in sync with UI changes** — paste a diff or describe a UI
  change, and ask Claude to update the affected Page Object's locators.
- **Extend CI** — ask Claude to add sharding, a nightly cron run, or Slack
  notifications to `.github/workflows/playwright.yml`.

Example prompts are listed at the bottom of `CLAUDE.md`.

### Playwright MCP (standalone, any client)

`npm run mcp:playwright` starts the [Playwright MCP server](https://github.com/microsoft/playwright-mcp)
(`@playwright/mcp`, launched on demand via `npx` — no install step). It's a
plain [Model Context Protocol](https://modelcontextprotocol.io) server with
no dependency on any specific AI tool or vendor — it lets *any* MCP client
drive a real, visible browser directly (navigate, click, fill forms, read
the accessibility tree) instead of writing a throwaway script just to see
what a page looks like. It's independent of this repo's own
`playwright.config.ts`/test suite; think of it as a live "hands on the
keyboard" tool for exploring SauceDemo, debugging a selector, or sanity
checking a flow before turning it into a Page Object + spec, complementing
`npm run codegen`.

To use it, point your MCP client of choice at the same command
(`npx -y @playwright/mcp@latest`, or `npm run mcp:playwright` from this
directory) in whatever config format that client expects, for example:

- **Claude Code**: `claude mcp add playwright -- npx -y @playwright/mcp@latest`
  (or add it to a project's own `.mcp.json` if you want it checked in and
  shared with a team)
- **Cursor**: add the same command under `mcpServers` in `.cursor/mcp.json`
- **VS Code (Copilot)**: add it under `servers` in `.vscode/mcp.json`

It can also run as a standalone network server instead of being spawned
per-client — `npx @playwright/mcp@latest --port 8931` starts it listening
over SSE/HTTP, so multiple MCP clients (or machines) can connect to the
same instance; add `--shared-browser-context` to have them share one
browser instead of each getting their own.

## 7. Adjusting for your own app

1. Change `use.baseURL` in `playwright.config.ts` (or set `BASE_URL` env var).
2. Replace `pages/*.ts` with Page Objects for your app's screens.
3. Replace `fixtures/testData.ts` with your own test accounts/data — never
   commit real production credentials; use a `.env` file (already gitignored)
   and `process.env` for anything sensitive.
4. Update selectors to prefer accessible queries (`getByRole`, `getByLabel`)
   or stable `data-testid` attributes your app exposes.

## 8. Notes on the demo site

SauceDemo intentionally ships a few broken users for testing error paths:
`locked_out_user` (blocked), `problem_user` (broken images/UI), and
`performance_glitch_user` (slow responses) — useful for practicing
resilient locators and negative-path tests.
