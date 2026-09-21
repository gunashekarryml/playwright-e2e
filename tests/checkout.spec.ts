import { test, expect } from '../fixtures/pageFixtures';
import { users, customer } from '../fixtures/testData';

test.describe('Checkout', () => {
  test.beforeEach(async ({ loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Fleece Jacket');
    await inventoryPage.goToCart();
  });

  test('completes an order end-to-end with valid details', async ({ cartPage, checkoutPage }) => {
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
