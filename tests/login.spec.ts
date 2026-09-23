import { test } from '../fixtures/pageFixtures';
import { users } from '../fixtures/testData';

test.describe('Login', () => {
  test('standard user can log in successfully', { tag: '@smoke' }, async ({ loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
    await inventoryPage.expectLoaded();
  });

  test('locked out user sees an error', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users.lockedOut.username, users.lockedOut.password);
    await loginPage.expectLoginError('Sorry, this user has been locked out.');
  });

  test('invalid credentials are rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('invalid_user', 'wrong_password');
    await loginPage.expectLoginError('Username and password do not match');
  });

  test('empty submission is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.loginButton.click();
    await loginPage.expectLoginError('Username is required');
  });
});
