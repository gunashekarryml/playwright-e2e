import type { AxeResults } from 'axe-core';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/pageFixtures';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

const BLOCKING_IMPACTS = ['critical', 'serious'];

function expectNoBlockingViolations(results: AxeResults) {
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe('Accessibility', () => {
  test('login page has no critical or serious a11y violations', async ({ page, loginPage }) => {
    await loginPage.goto();
    expectNoBlockingViolations(await new AxeBuilder({ page }).analyze());
  });

  test.describe('authenticated pages', () => {
    test.use({ storageState: STANDARD_USER_STORAGE_STATE });

    test('inventory page has no critical or serious a11y violations', async ({ page, inventoryPage }) => {
      await inventoryPage.goto();
      expectNoBlockingViolations(await new AxeBuilder({ page }).analyze());
    });

    test('cart page has no critical or serious a11y violations', async ({ page, inventoryPage, cartPage }) => {
      await inventoryPage.goto();
      await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
      await inventoryPage.goToCart();
      await cartPage.expectItemCount(1);
      expectNoBlockingViolations(await new AxeBuilder({ page }).analyze());
    });

    test('checkout page has no critical or serious a11y violations', async ({ page, inventoryPage, cartPage }) => {
      await inventoryPage.goto();
      await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
      await inventoryPage.goToCart();
      await cartPage.checkout();
      expectNoBlockingViolations(await new AxeBuilder({ page }).analyze());
    });
  });
});
