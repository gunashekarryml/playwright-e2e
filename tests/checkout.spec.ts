import { test, expect } from '../fixtures/pageFixtures';
import { customer, TAX_RATE } from '../fixtures/testData';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Checkout', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addItemToCartByName('Sauce Labs Backpack');
    await inventoryPage.addItemToCartByName('Sauce Labs Fleece Jacket');
    await inventoryPage.goToCart();
  });

  test('completes an order end-to-end with valid details', { tag: ['@checkout', '@smoke', '@critical'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);

    const { subtotal, tax, total } = await checkoutPage.getTotals();
    expect(total).toBeCloseTo(subtotal + tax, 2);

    await checkoutPage.finish();
    await checkoutPage.expectOrderComplete();
  });

  test('blocks checkout when required fields are missing', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo('', '', '');
    await checkoutPage.expectValidationError('First Name is required');
  });

  test('requires a last name', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, '', customer.postalCode);
    await checkoutPage.expectValidationError('Last Name is required');
  });

  test('requires a postal code', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, '');
    await checkoutPage.expectValidationError('Postal Code is required');
  });

  test('cancelling on the information step returns to the cart', { tag: ['@checkout', '@medium'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.cancelButton.click();
    await cartPage.expectOnCartPage();
    await cartPage.expectItemCount(2);
  });

  test('cancelling on the overview step returns to the product list', { tag: ['@checkout', '@medium'] }, async ({ cartPage, checkoutPage, inventoryPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.cancelButton.click();
    await inventoryPage.expectLoaded();
  });

  test('the overview lists the selected items with their prices', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.expectOnOverviewStep();
    expect(await checkoutPage.getOverviewItemNames()).toEqual(['Sauce Labs Backpack', 'Sauce Labs Fleece Jacket']);
    expect(await checkoutPage.getOverviewItemPrices()).toEqual([29.99, 49.99]);
  });

  test('the item total equals the sum of the item prices', { tag: ['@checkout', '@critical'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    const prices = await checkoutPage.getOverviewItemPrices();
    const { subtotal } = await checkoutPage.getTotals();
    expect(subtotal).toBeCloseTo(prices.reduce((sum, p) => sum + p, 0), 2);
  });

  test('tax is calculated at 8% of the item total', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    const { subtotal, tax } = await checkoutPage.getTotals();
    expect(tax).toBeCloseTo(subtotal * TAX_RATE, 2);
  });

  test('the overview shows payment and shipping information', { tag: ['@checkout', '@low'] }, async ({ page, cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await expect(page.getByText('SauceCard #31337')).toBeVisible();
    await expect(page.getByText('Free Pony Express Delivery!')).toBeVisible();
  });

  test('the confirmation page thanks the customer', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.finish();
    await checkoutPage.expectOnCompleteStep();
    await checkoutPage.expectOrderComplete();
    await expect(checkoutPage.completeText).toContainText('Your order has been dispatched');
  });

  test('the cart is empty after an order is placed', { tag: ['@checkout', '@high'] }, async ({ cartPage, checkoutPage, inventoryPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.finish();
    await checkoutPage.expectOrderComplete();
    await inventoryPage.expectCartCount(0);
  });

  test('Back Home returns to the product list after an order', { tag: ['@checkout', '@medium'] }, async ({ cartPage, checkoutPage, inventoryPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.finish();
    await checkoutPage.backHomeButton.click();
    await inventoryPage.expectLoaded();
  });

  test('the order confirmation can be downloaded as a PDF', { tag: ['@checkout', '@medium'] }, async ({ page, cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await checkoutPage.finish();
    const download = page.waitForEvent('download');
    await checkoutPage.generatePdfButton.click();
    expect((await download).suggestedFilename()).toMatch(/^swag-labs-order-.*\.pdf$/);
  });

  // ---- Intentional failures (excluded when DEMO_FAILURES=off, see playwright.config.ts) ----
  test('[Demo] tax is calculated at 10% of the item total', { tag: ['@checkout', '@high', '@demo-failure'] }, async ({ cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    const { subtotal, tax } = await checkoutPage.getTotals();
    expect(tax).toBeCloseTo(subtotal * 0.1, 2); // the shop charges 8%, so this expectation is wrong on purpose
  });

  test('[Demo] a promo code can be applied before paying', { tag: ['@checkout', '@high', '@demo-failure'] }, async ({ page, cartPage, checkoutPage }) => {
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo(customer.firstName, customer.lastName, customer.postalCode);
    await page.getByPlaceholder('Promo code').fill('SAVE10'); // the shop has no promo code field yet
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('SAVE10')).toBeVisible();
  });
});
