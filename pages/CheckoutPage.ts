import { type Locator, type Page, expect } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly finishButton: Locator;
  readonly completeHeader: Locator;
  readonly summarySubtotal: Locator;
  readonly summaryTax: Locator;
  readonly summaryTotal: Locator;
  readonly errorMessage: Locator;
  readonly cancelButton: Locator;
  readonly backHomeButton: Locator;
  readonly generatePdfButton: Locator;
  readonly overviewItems: Locator;
  readonly completeText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.locator('[data-test="firstName"]');
    this.lastNameInput = page.locator('[data-test="lastName"]');
    this.postalCodeInput = page.locator('[data-test="postalCode"]');
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.finishButton = page.getByRole('button', { name: 'Finish' });
    this.completeHeader = page.locator('.complete-header');
    this.summarySubtotal = page.locator('.summary_subtotal_label');
    this.summaryTax = page.locator('.summary_tax_label');
    this.summaryTotal = page.locator('.summary_total_label');
    this.errorMessage = page.locator('[data-test="error"]');
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.backHomeButton = page.getByRole('button', { name: 'Back Home' });
    this.generatePdfButton = page.getByRole('button', { name: /Generate PDF/i });
    this.overviewItems = page.locator('.cart_item');
    this.completeText = page.locator('.complete-text');
  }

  async fillCustomerInfo(firstName: string, lastName: string, postalCode: string) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
    await this.continueButton.click();
  }

  async expectValidationError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }

  async finish() {
    await this.finishButton.click();
  }

  async expectOrderComplete() {
    await expect(this.completeHeader).toHaveText('Thank you for your order!');
  }

  async getTotals() {
    const subtotal = parseFloat((await this.summarySubtotal.textContent())!.replace('Item total: $', ''));
    const tax = parseFloat((await this.summaryTax.textContent())!.replace('Tax: $', ''));
    const total = parseFloat((await this.summaryTotal.textContent())!.replace('Total: $', ''));
    return { subtotal, tax, total };
  }

  async expectOnInformationStep() {
    await expect(this.page).toHaveURL(/checkout-step-one/);
  }

  async expectOnOverviewStep() {
    await expect(this.page).toHaveURL(/checkout-step-two/);
  }

  async expectOnCompleteStep() {
    await expect(this.page).toHaveURL(/checkout-complete/);
  }

  async getOverviewItemNames(): Promise<string[]> {
    await this.overviewItems.first().waitFor();
    return this.overviewItems.locator('[data-test="inventory-item-name"]').allTextContents();
  }

  async getOverviewItemPrices(): Promise<number[]> {
    await this.overviewItems.first().waitFor();
    const texts = await this.overviewItems.locator('.inventory_item_price').allTextContents();
    return texts.map((t) => parseFloat(t.replace('$', '')));
  }
}
