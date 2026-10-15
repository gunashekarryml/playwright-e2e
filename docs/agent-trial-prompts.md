# Agent trial: maintenance tasks 6-10

Compare each agent PR against branch `local-claude-maintenance` (same five tasks done locally).
Assign each as a separate task in the GitHub Agents tab. Paste the text under each heading.

## Task 6: selectors
Replace class-based locators in `pages/` (e.g. `.title`, `.cart_item`, `.shopping_cart_badge`, `.inventory_item`, summary labels) with `getByRole`/`getByPlaceholder`, or `data-test` attributes where no role fits. Follow AGENTS.md. Run the chromium suite before opening the PR.

## Task 7: severity tags
Audit every test in `tests/` for a severity tag (`@critical`, `@high`, `@medium`, `@low`). Add any that are missing, with `@smoke` for critical journeys. Report in the PR description which tests were changed, or state that none were missing.

## Task 8: refactor
Remove duplicated locator and setup code in `pages/` and `tests/` (for example repeated item locators in InventoryPage and repeated add-to-cart setup in the accessibility spec). No behaviour changes.

## Task 9: dependencies
Update dependencies to the latest versions allowed by the existing semver ranges in package.json (`npm update`). Do not bump major versions. Confirm lint, tsc and the chromium suite pass.

## Task 10: dead code
Find and remove unused Page Object members and test data that nothing references. Keep `users.problem` in `fixtures/testData.ts`. List each removal in the PR description.
