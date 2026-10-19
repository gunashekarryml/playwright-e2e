import { test, expect } from '../fixtures/pageFixtures';
import { users } from '../fixtures/testData';

test.describe('Login', () => {
  test('standard user can log in successfully', { tag: ['@login', '@smoke', '@critical'] }, async ({ loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
    await inventoryPage.expectLoaded();
  });

  test('locked out user sees an error', { tag: ['@login', '@high'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users.lockedOut.username, users.lockedOut.password);
    await loginPage.expectLoginError('Sorry, this user has been locked out.');
  });

  test('invalid credentials are rejected', { tag: ['@login', '@high'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('invalid_user', 'wrong_password');
    await loginPage.expectLoginError('Username and password do not match');
  });

  test('a valid username with the wrong password is rejected', { tag: ['@login', '@high'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, 'not_the_password');
    await loginPage.expectLoginError('Username and password do not match');
  });

  test('empty submission is rejected', { tag: ['@login', '@medium'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.loginButton.click();
    await loginPage.expectLoginError('Username is required');
  });

  test('a missing password is rejected', { tag: ['@login', '@medium'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.usernameInput.fill(users.standard.username);
    await loginPage.loginButton.click();
    await loginPage.expectLoginError('Password is required');
  });

  test('the error message can be dismissed', { tag: ['@login', '@low'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.loginButton.click();
    await expect(loginPage.errorMessage).toBeVisible();
    await loginPage.errorDismissButton.click();
    await expect(loginPage.errorMessage).toHaveCount(0);
  });

  test('the password field masks what is typed', { tag: ['@login', '@low'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.passwordInput.fill('secret_sauce');
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('a protected page redirects to login with a message when not logged in', { tag: ['@login', '@high'] }, async ({ page, loginPage }) => {
    await page.goto('/inventory.html');
    await loginPage.expectOnLoginPage();
    await loginPage.expectLoginError("You can only access '/inventory.html' when you are logged in.");
  });

  test('the user stays logged in after a page reload', { tag: ['@login', '@medium'] }, async ({ page, loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
    await inventoryPage.expectLoaded();
    await page.reload();
    await inventoryPage.expectLoaded();
  });

  // ---- Intentional failure (excluded when DEMO_FAILURES=off, see playwright.config.ts) ----
  test('[Demo] a wrong password shows the agreed error wording', { tag: ['@login', '@medium', '@demo-failure'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, 'not_the_password');
    await expect(loginPage.errorMessage).toContainText('Invalid username or password'); // the site words it differently
  });
});
