import { test, expect } from '../fixtures/pageFixtures';
import { products } from '../fixtures/testData';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Product details', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test('clicking a product name opens its details page', { tag: ['@product', '@high'] }, async ({ inventoryPage, productDetailsPage }) => {
    await inventoryPage.goto();
    await inventoryPage.openProductByName('Sauce Labs Backpack');
    await productDetailsPage.expectOnDetailsPage();
    await expect(productDetailsPage.name).toHaveText('Sauce Labs Backpack');
  });

  test('clicking a product image opens its details page', { tag: ['@product', '@medium'] }, async ({ inventoryPage, productDetailsPage }) => {
    await inventoryPage.goto();
    await inventoryPage.openProductByImage('Sauce Labs Bike Light');
    await productDetailsPage.expectOnDetailsPage();
    await expect(productDetailsPage.name).toHaveText('Sauce Labs Bike Light');
  });

  for (const { name, price, id } of [products[0], products[3], products[5]]) {
    test(`details page for ${name} shows its image, description and price`, { tag: ['@product', '@high'] }, async ({ productDetailsPage }) => {
      await productDetailsPage.goto(id);
      await expect(productDetailsPage.name).toHaveText(name);
      await expect(productDetailsPage.price).toHaveText(`$${price}`);
      await expect(productDetailsPage.description).not.toBeEmpty();
      await expect(productDetailsPage.image).toBeVisible();
    });
  }

  test('adding to the cart from the details page updates the badge', { tag: ['@product', '@high'] }, async ({ productDetailsPage }) => {
    await productDetailsPage.goto(4);
    await productDetailsPage.addToCartButton.click();
    await expect(productDetailsPage.cartBadge).toHaveText('1');
    await expect(productDetailsPage.removeButton).toBeVisible();
  });

  test('removing from the details page clears the badge', { tag: ['@product', '@medium'] }, async ({ productDetailsPage }) => {
    await productDetailsPage.goto(4);
    await productDetailsPage.addToCartButton.click();
    await productDetailsPage.removeButton.click();
    await expect(productDetailsPage.cartBadge).toHaveCount(0);
    await expect(productDetailsPage.addToCartButton).toBeVisible();
  });

  test('Back to products returns to the listing', { tag: ['@product', '@medium'] }, async ({ productDetailsPage, inventoryPage }) => {
    await productDetailsPage.goto(1);
    await productDetailsPage.backButton.click();
    await inventoryPage.expectLoaded();
  });

  test('a product added on the details page shows as added in the listing', { tag: ['@product', '@medium'] }, async ({ productDetailsPage, inventoryPage }) => {
    await productDetailsPage.goto(2);
    await productDetailsPage.addToCartButton.click();
    await productDetailsPage.backButton.click();
    await expect(inventoryPage.removeButton('Sauce Labs Onesie')).toBeVisible();
    await inventoryPage.expectCartCount(1);
  });
});
