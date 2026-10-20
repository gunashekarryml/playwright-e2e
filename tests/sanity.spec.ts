import { test, expect } from '../fixtures/pageFixtures';
import { users } from '../fixtures/testData';

// Sanity suite: quick check of the login journey. Run with the "Sanity" suite (chromium only, no retries).
test.describe('Sanity - Login', () => {
  test('standard user can log in successfully', { tag: ['@sanity-login', '@login', '@critical'] }, async ({ loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
    await inventoryPage.expectLoaded();
  });

  test('wrong password shows the agreed error wording', { tag: ['@sanity-login', '@login', '@high'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, 'not_the_password');
    await expect(loginPage.errorMessage).toContainText('Invalid username or password'); // intentional: the site words it differently
  });

  test.skip('SSO login is available', { tag: ['@sanity-login', '@login', '@low'] }, async () => {
    // Skipped on purpose: SSO is not implemented in this environment yet.
  });
});
