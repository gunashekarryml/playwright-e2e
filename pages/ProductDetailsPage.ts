import { type Locator, type Page, expect } from '@playwright/test';

/** A single product's detail page (inventory-item.html?id=N). */
export class ProductDetailsPage {
  readonly page: Page;
  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  readonly image: Locator;
  readonly addToCartButton: Locator;
  readonly removeButton: Locator;
  readonly backButton: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.name = page.locator('[data-test="inventory-item-name"]');
    this.description = page.locator('[data-test="inventory-item-desc"]');
    this.price = page.locator('[data-test="inventory-item-price"]');
    this.image = page.locator('[data-test^="item-"][data-test$="-img"]');
    this.addToCartButton = page.locator('[data-test="add-to-cart"]');
    this.removeButton = page.locator('[data-test="remove"]');
    this.backButton = page.locator('[data-test="back-to-products"]');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
  }

  async goto(id: number) {
    await this.page.goto(`/inventory-item.html?id=${id}`);
  }

  async expectOnDetailsPage() {
    await expect(this.page).toHaveURL(/inventory-item\.html\?id=\d+/);
    await expect(this.backButton).toBeVisible(); // the details view has rendered, not the list underneath
  }
}
