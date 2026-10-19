import { test, expect } from '../fixtures/pageFixtures';
import { products, users } from '../fixtures/testData';

// SauceDemo ships several special accounts that behave differently on purpose.
const profiles = [
  { label: 'performance_glitch_user', user: users.performanceGlitch },
  { label: 'error_user', user: users.error },
  { label: 'visual_user', user: users.visual },
  { label: 'problem_user', user: users.problem },
];

test.describe('User profiles', () => {
  for (const { label, user } of profiles) {
    test(`${label} can log in and sees the full catalog`, { tag: ['@users', '@medium'] }, async ({ loginPage, inventoryPage }) => {
      await loginPage.goto();
      await loginPage.login(user.username, user.password);
      // performance_glitch_user is deliberately slow to log in
      await expect(inventoryPage.pageTitle).toHaveText('Products', { timeout: 15_000 });
      await expect(inventoryPage.inventoryItems).toHaveCount(products.length);
    });
  }

  test('problem_user sees a distinct image for every product', { tag: ['@users', '@medium'] }, async ({ loginPage, inventoryPage }) => {
    // Known site defect: problem_user is served the same placeholder image for every product.
    // Marked as an expected failure so it is tracked, and flags loudly if the defect is ever fixed.
    test.fail(true, 'Known defect: problem_user is shown the same placeholder image for all products');
    await loginPage.goto();
    await loginPage.login(users.problem.username, users.problem.password);
    await inventoryPage.expectLoaded();
    const sources = await inventoryPage.productImages.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
    expect(new Set(sources).size).toBe(products.length);
  });
});
