# AGENTS.md

Instructions for coding agents (GitHub Copilot coding agent, Codex, etc.) working in this repo.
Mirrors CLAUDE.md; keep the two in sync.

## Project

Playwright + TypeScript E2E suite against https://www.saucedemo.com, using the Page Object Model.

## Layout

- `pages/` Page Objects: locators and actions only
- `fixtures/pageFixtures.ts` extends `test` with the page objects injected
- `fixtures/testData.ts` shared test data and credentials
- `tests/` spec files, one per feature area
- `playwright.config.ts` projects (chromium, firefox, webkit, mobile)

## Rules

- Import `test`/`expect` from `../fixtures/pageFixtures`, never from `@playwright/test`.
- No raw locators in spec files. Add interactions to the relevant Page Object.
- Locator preference: `getByRole`, `getByPlaceholder`, `getByText`, then `data-test` attributes, then class selectors as a last resort.
- Keep assertions in specs. Page Objects only expose reusable `expectX()` helpers.
- One `test.describe` per feature; use `test.beforeEach` for shared setup.
- Every test needs a severity tag in its `tag` option: `@critical`, `@high`, `@medium` or `@low`. Critical journeys also get `@smoke`, e.g. `{ tag: ['@smoke', '@critical'] }`.
- New credentials or data go in `fixtures/testData.ts`.
- Do not edit `.github/workflows/`, `slack/`, `dashboard/` or `scripts/` unless the task says so.
- Do not add `package.json` dependencies unless the task says so. Never bump major versions.

## Before opening a PR

Run `npx tsc --noEmit`, `npm run lint` and `npx playwright test --project=chromium`. All must pass.
The PR description must list what changed, why, and the test results.
