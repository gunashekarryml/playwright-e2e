# CLAUDE.md

Context file for Claude Code when working in this repo. Claude Code reads this
automatically at the start of a session in this directory.

## Project

Sample E2E test suite using Playwright + TypeScript against the public demo
app https://www.saucedemo.com. Structured with the Page Object Model (POM).

## Layout

- `pages/` — Page Objects (locators + actions only, no assertions about test intent)
- `fixtures/pageFixtures.ts` — extends Playwright's `test` with the page objects injected
- `fixtures/testData.ts` — shared test data/credentials
- `tests/` — spec files, one per feature area (`login`, `cart`, `checkout`)
- `playwright.config.ts` — projects (chromium/firefox/webkit/mobile), retries, reporters

## Conventions Claude should follow when adding tests

- Import `test`/`expect` from `../fixtures/pageFixtures`, never directly from `@playwright/test`.
- Add new page interactions to the relevant Page Object in `pages/`; do not put raw locators in spec files.
- Prefer `getByRole`, `getByPlaceholder`, `getByText` over CSS selectors; fall back to `data-test` attributes (SauceDemo exposes these) before brittle class selectors.
- One `test.describe` per feature; use `test.beforeEach` for shared setup (e.g., login).
- Keep assertions in the spec file, not in the Page Object — Page Objects should only expose `expectX()` helpers for common, reused checks.
- New credentials or fixtures go in `fixtures/testData.ts`, not hardcoded in specs.

## Commands

- `npm test` — run the full suite headless
- `npm run test:ui` — interactive UI mode (best for debugging)
- `npm run test:headed` — run with a visible browser
- `npx playwright test tests/login.spec.ts` — run a single file
- `npx playwright show-report` — open the last HTML report
- `npx playwright codegen https://www.saucedemo.com` — record new interactions
- `npm run report:allure:generate` — build an Allure report from `allure-results/` (needs Java locally)
- `npm run report:allure:open` — serve the generated Allure report in a browser

## Useful prompts for Claude Code in this repo

- "Add a Page Object and spec for the SauceDemo product detail page"
- "Generate a data-driven test that tries all three SauceDemo users (`standard_user`, `problem_user`, `performance_glitch_user`) and asserts login behavior for each"
- "The checkout spec is flaky on webkit — investigate using the trace in test-results/ and fix it"
- "Refactor CheckoutPage to expose a single `completeCheckout()` helper that fills info, continues, and finishes"
