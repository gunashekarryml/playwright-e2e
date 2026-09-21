# Playwright E2E Sample (with Claude Code)

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
│   └── checkout.spec.ts
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

## 5. How Claude Code fits in

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

## 6. Adjusting for your own app

1. Change `use.baseURL` in `playwright.config.ts` (or set `BASE_URL` env var).
2. Replace `pages/*.ts` with Page Objects for your app's screens.
3. Replace `fixtures/testData.ts` with your own test accounts/data — never
   commit real production credentials; use a `.env` file (already gitignored)
   and `process.env` for anything sensitive.
4. Update selectors to prefer accessible queries (`getByRole`, `getByLabel`)
   or stable `data-testid` attributes your app exposes.

## 7. Notes on the demo site

SauceDemo intentionally ships a few broken users for testing error paths:
`locked_out_user` (blocked), `problem_user` (broken images/UI), and
`performance_glitch_user` (slow responses) — useful for practicing
resilient locators and negative-path tests.
