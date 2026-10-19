import { test, expect } from '../fixtures/pageFixtures';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Menu and navigation', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('the menu lists every navigation option', { tag: ['@menu', '@medium'] }, async ({ menuPage }) => {
    await menuPage.open();
    await expect(menuPage.allItemsLink).toBeVisible();
    await expect(menuPage.dynamicCatalogLink).toBeVisible();
    await expect(menuPage.aboutLink).toBeVisible();
    await expect(menuPage.logoutLink).toBeVisible();
    await expect(menuPage.resetLink).toBeVisible();
  });

  test('logging out returns to the login page', { tag: ['@menu', '@high'] }, async ({ menuPage, loginPage }) => {
    await menuPage.logout();
    await loginPage.expectOnLoginPage();
  });

  test('a logged-out user cannot return to the product list', { tag: ['@menu', '@high'] }, async ({ page, menuPage, loginPage }) => {
    await menuPage.logout();
    await page.goto('/inventory.html');
    await loginPage.expectOnLoginPage();
  });

  test('Reset App State empties the cart', { tag: ['@menu', '@high'] }, async ({ inventoryPage, menuPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);
    await menuPage.resetAppState();
    await inventoryPage.expectCartCount(0);
  });

  test('All Items goes back to the product list', { tag: ['@menu', '@medium'] }, async ({ page, inventoryPage, cartPage, menuPage }) => {
    await inventoryPage.goToCart();
    await cartPage.expectOnCartPage();
    await menuPage.open();
    await menuPage.allItemsLink.click();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('About links to saucelabs.com', { tag: ['@menu', '@low'] }, async ({ menuPage }) => {
    await menuPage.open();
    await expect(menuPage.aboutLink).toHaveAttribute('href', /saucelabs\.com/);
  });

  test('the menu can be closed', { tag: ['@menu', '@low'] }, async ({ menuPage }) => {
    await menuPage.open();
    await menuPage.close();
    await expect(menuPage.logoutLink).toBeHidden();
  });

  test('the menu is available from the cart page', { tag: ['@menu', '@low'] }, async ({ inventoryPage, menuPage }) => {
    await inventoryPage.goToCart();
    await menuPage.open();
    await expect(menuPage.logoutLink).toBeVisible();
  });

  // ---- Intentional failure (excluded when DEMO_FAILURES=off, see playwright.config.ts) ----
  test('[Demo] the Sauce Labs status page is reachable', { tag: ['@menu', '@low', '@demo-failure'] }, async ({ page }) => {
    await page.goto('http://127.0.0.1:65000/status'); // nothing listens here, simulating an unreachable service
    await expect(page).toHaveURL(/status/);
  });
});
