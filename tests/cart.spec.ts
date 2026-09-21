import { test, expect } from '../fixtures/pageFixtures';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Shopping cart', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('adding an item updates the cart badge', { tag: '@smoke' }, async ({ inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);
  });

  test('removing an item clears the cart badge', async ({ inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);
    await inventoryPage.removeItemFromCartByName('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(0);
  });

  test('cart page reflects items added from the product list', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Bike Light');
    await inventoryPage.goToCart();

    await cartPage.expectItemCount(2);
    await cartPage.expectItemInCart('Sauce Labs Backpack');
    await cartPage.expectItemInCart('Sauce Labs Bike Light');
  });

  test('products can be sorted low to high by price', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('lohi');
    const prices = await inventoryPage.getDisplayedPrices();
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });
});
