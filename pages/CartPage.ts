import { type Locator, type Page, expect } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly cartItems: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cartItems = page.locator('.cart_item');
    this.checkoutButton = page.getByRole('button', { name: 'Checkout' });
    this.continueShoppingButton = page.getByRole('button', { name: 'Continue Shopping' });
  }

  async expectItemCount(count: number) {
    await expect(this.cartItems).toHaveCount(count);
  }

  async expectItemInCart(name: string) {
    await expect(this.page.locator('.cart_item', { hasText: name })).toBeVisible();
  }

  async checkout() {
    await this.checkoutButton.click();
  }

  cartItem(name: string) {
    return this.page.locator('.cart_item', { hasText: name });
  }

  async removeItem(name: string) {
    await this.cartItem(name).getByRole('button', { name: /remove/i }).click();
  }

  async continueShopping() {
    await this.continueShoppingButton.click();
  }

  async getItemPrice(name: string): Promise<number> {
    const text = await this.cartItem(name).locator('.inventory_item_price').textContent();
    return parseFloat(text!.replace('$', ''));
  }

  async getItemQuantity(name: string): Promise<string> {
    return (await this.cartItem(name).locator('.cart_quantity').textContent())!.trim();
  }

  async expectOnCartPage() {
    await expect(this.page).toHaveURL(/cart\.html/);
  }
}
