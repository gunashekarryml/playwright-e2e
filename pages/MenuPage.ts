import { type Locator, type Page, expect } from '@playwright/test';

/** The slide-out navigation menu available on every logged-in page. */
export class MenuPage {
  readonly page: Page;
  readonly openButton: Locator;
  readonly closeButton: Locator;
  readonly allItemsLink: Locator;
  readonly dynamicCatalogLink: Locator;
  readonly aboutLink: Locator;
  readonly logoutLink: Locator;
  readonly resetLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.openButton = page.getByRole('button', { name: 'Open Menu' });
    this.closeButton = page.getByRole('button', { name: 'Close Menu' });
    this.allItemsLink = page.locator('[data-test="inventory-sidebar-link"]');
    this.dynamicCatalogLink = page.locator('[data-test="dynamic-catalog-sidebar-link"]');
    this.aboutLink = page.locator('[data-test="about-sidebar-link"]');
    this.logoutLink = page.locator('[data-test="logout-sidebar-link"]');
    this.resetLink = page.locator('[data-test="reset-sidebar-link"]');
  }

  async open() {
    await this.openButton.click();
    await expect(this.logoutLink).toBeVisible();
  }

  async close() {
    await this.closeButton.click();
  }

  async logout() {
    await this.open();
    await this.logoutLink.click();
  }

  async resetAppState() {
    await this.open();
    await this.resetLink.click();
  }
}
