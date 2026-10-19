import { type Locator, type Page } from '@playwright/test';

/** The "Dynamic Catalog" demo pages: lazy load, spinner and slider. */
export class DynamicCatalogPage {
  readonly page: Page;
  readonly lazyLoadLink: Locator;
  readonly spinnerLink: Locator;
  readonly sliderLink: Locator;
  readonly lazyItemNames: Locator;
  readonly loadingPlaceholders: Locator;
  readonly spinnerItemNames: Locator;
  readonly sliderProduct: Locator;

  constructor(page: Page) {
    this.page = page;
    this.lazyLoadLink = page.locator('[data-test="dynamic-catalog-lazy-load-link"]');
    this.spinnerLink = page.locator('[data-test="dynamic-catalog-spinner-link"]');
    this.sliderLink = page.locator('[data-test="dynamic-catalog-slider-link"]');
    this.lazyItemNames = page.locator('[data-test^="lazy-load-item-"][data-test$="-name"]');
    this.loadingPlaceholders = page.getByText('Loading…');
    this.spinnerItemNames = page.locator('[data-test^="spinner-item-"][data-test$="-name"]');
    this.sliderProduct = page.getByText(/^(Sauce Labs|Test\.allTheThings)/).first();
  }

  async gotoLazyLoad() {
    await this.page.goto('/dynamic-catalog-lazy-load.html');
  }

  async gotoSpinner() {
    await this.page.goto('/dynamic-catalog-spinner.html');
  }

  async gotoSlider() {
    await this.page.goto('/dynamic-catalog-slider.html');
  }
}
