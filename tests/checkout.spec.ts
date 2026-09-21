import { test, expect } from '../fixtures/pageFixtures';
import { customer } from '../fixtures/testData';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Checkout', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Fleece Jacket');
    await inventoryPage.goToCart();
  });

  test('completes an order end-to-end with valid details', { tag: '@smoke' }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);

    const { subtotal, tax, total } = await checkoutPage.getTotals();
    expect(total).toBeCloseTo(subtotal + tax, 2);

    await checkoutPage.finish();
    await checkoutPage.expectOrderComplete();
  });

  test('blocks checkout when required fields are missing', async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo('', '', '');
    await checkoutPage.expectValidationError('First Name is required');
  });
});
