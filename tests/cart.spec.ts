import { test, expect } from '../fixtures/pageFixtures';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Shopping cart', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('adding an item updates the cart badge', { tag: ['@cart', '@smoke', '@critical'] }, async ({ inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);
  });

  test('removing an item clears the cart badge', { tag: ['@cart', '@high'] }, async ({ inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);
    await inventoryPage.removeItemFromCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(0);
  });

  test('cart page reflects items added from the product list', { tag: ['@cart', '@high'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Bike Light');
    await inventoryPage.goToCart();

    await cartPage.expectItemCount(2);
    await cartPage.expectItemInCart('Sauce Labs Backpack');
    await cartPage.expectItemInCart('Sauce Labs Bike Light');
  });

  test('products can be sorted low to high by price', { tag: ['@cart', '@low'] }, async ({ inventoryPage }) => {
    await inventoryPage.sortBy('lohi');
    const prices = await inventoryPage.getDisplayedPrices();
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  test('an empty cart shows no items', { tag: ['@cart', '@medium'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.goToCart();
    await cartPage.expectOnCartPage();
    await cartPage.expectItemCount(0);
  });

  test('an item can be removed from the cart page', { tag: ['@cart', '@high'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Onesie');
    await inventoryPage.goToCart();
    await cartPage.removeItem('Sauce Labs Backpack');
    await cartPage.expectItemCount(1);
    await expect(cartPage.cartItem('Sauce Labs Backpack')).toHaveCount(0);
    await inventoryPage.expectCartCount(1);
  });

  test('the cart shows each item with its price and quantity', { tag: ['@cart', '@medium'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Fleece Jacket');
    await inventoryPage.goToCart();
    expect(await cartPage.getItemPrice('Sauce Labs Fleece Jacket')).toBe(49.99);
    expect(await cartPage.getItemQuantity('Sauce Labs Fleece Jacket')).toBe('1');
  });

  test('Continue Shopping returns to the product list', { tag: ['@cart', '@medium'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.goToCart();
    await cartPage.continueShopping();
    await inventoryPage.expectLoaded();
  });

  test('cart contents are kept after a page reload', { tag: ['@cart', '@medium'] }, async ({ page, inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Bolt T-Shirt');
    await inventoryPage.goToCart();
    await page.reload();
    await cartPage.expectItemInCart('Sauce Labs Bolt T-Shirt');
  });

  test('Checkout opens the customer information step', { tag: ['@cart', '@high'] }, async ({ inventoryPage, cartPage, checkoutPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();
    await checkoutPage.expectOnInformationStep();
  });

  // ---- Intentional failure (excluded when DEMO_FAILURES=off, see playwright.config.ts): fails on the first attempt, passes on the retry ----
  test('[Demo] the cart shows the right item count (intermittent)', { tag: ['@cart', '@low', '@demo-failure'] }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    // Simulated data race: the first attempt sees a stale count, the retry sees the right one.
    await cartPage.expectItemCount(test.info().retry === 0 ? 2 : 1);
  });
});
