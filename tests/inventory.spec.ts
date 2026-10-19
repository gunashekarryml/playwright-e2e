import { test, expect } from '../fixtures/pageFixtures';
import { products, socialLinks } from '../fixtures/testData';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Product listing', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('lists all six products from the catalog', { tag: ['@inventory', '@high'] }, async ({ inventoryPage }) => {
    await expect(inventoryPage.inventoryItems).toHaveCount(products.length);
    expect(await inventoryPage.getDisplayedNames()).toEqual(products.map((p) => p.name));
  });

  test('every product shows an image, description, price and add-to-cart button', { tag: ['@inventory', '@high'] }, async ({ inventoryPage }) => {
    for (const { name } of products) {
      const card = inventoryPage.productCard(name);
      await expect(card.getByRole('img')).toBeVisible();
      await expect(card.locator('[data-test="inventory-item-desc"]')).not.toBeEmpty();
      await expect(card.locator('.inventory_item_price')).toContainText('$');
      await expect(inventoryPage.addToCartButton(name)).toBeEnabled();
    }
  });

  for (const { name, price } of products) {
    test(`shows the correct price for ${name}`, { tag: ['@inventory', '@medium'] }, async ({ inventoryPage }) => {
      await expect(inventoryPage.productCard(name).locator('.inventory_item_price')).toHaveText(`$${price}`);
    });
  }

  test('products can be sorted by name A to Z', { tag: ['@inventory', '@medium'] }, async ({ inventoryPage }) => {
    await inventoryPage.sortBy('az');
    const names = await inventoryPage.getDisplayedNames();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('products can be sorted by name Z to A', { tag: ['@inventory', '@medium'] }, async ({ inventoryPage }) => {
    await inventoryPage.sortBy('za');
    const names = await inventoryPage.getDisplayedNames();
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  test('products can be sorted by price high to low', { tag: ['@inventory', '@medium'] }, async ({ inventoryPage }) => {
    await inventoryPage.sortBy('hilo');
    const prices = await inventoryPage.getDisplayedPrices();
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('add to cart switches to remove and updates the cart badge', { tag: ['@inventory', '@high'] }, async ({ inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Onesie');
    await expect(inventoryPage.removeButton('Sauce Labs Onesie')).toBeVisible();
    await inventoryPage.expectCartCount(1);
  });

  test('adding several products increases the cart badge each time', { tag: ['@inventory', '@medium'] }, async ({ inventoryPage }) => {
    for (const [index, { name }] of products.slice(0, 3).entries()) {
      await inventoryPage.addItemToCartByName(name);
      await inventoryPage.expectCartCount(index + 1);
    }
  });

  test('the cart badge survives a page reload', { tag: ['@inventory', '@medium'] }, async ({ page, inventoryPage }) => {
    await inventoryPage.addItemToCartByName('Sauce Labs Bike Light');
    await page.reload();
    await inventoryPage.expectCartCount(1);
    await expect(inventoryPage.removeButton('Sauce Labs Bike Light')).toBeVisible();
  });

  test('footer shows the copyright notice', { tag: ['@inventory', '@low'] }, async ({ inventoryPage }) => {
    await expect(inventoryPage.footerCopy).toContainText('Sauce Labs. All Rights Reserved.');
  });

  for (const { key, host } of socialLinks) {
    test(`footer ${key} link points to ${host} and opens in a new tab`, { tag: ['@inventory', '@low'] }, async ({ inventoryPage }) => {
      const link = inventoryPage.socialLink(key);
      await expect(link).toHaveAttribute('href', new RegExp(host.replace('.', '\\.')));
      await expect(link).toHaveAttribute('target', '_blank');
    });
  }
});
