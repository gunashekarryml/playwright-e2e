import { test, expect } from '../fixtures/pageFixtures';
import { STANDARD_USER_STORAGE_STATE } from '../global-setup';

test.describe('Dynamic catalog', () => {
  test.use({ storageState: STANDARD_USER_STORAGE_STATE });

  test('the menu exposes the Lazy Load, Spinner and Slider demos', { tag: ['@catalog', '@low'] }, async ({ inventoryPage, menuPage, dynamicCatalogPage }) => {
    await inventoryPage.goto();
    await menuPage.open();
    await menuPage.dynamicCatalogLink.click();
    await expect(dynamicCatalogPage.lazyLoadLink).toBeVisible();
    await expect(dynamicCatalogPage.spinnerLink).toBeVisible();
    await expect(dynamicCatalogPage.sliderLink).toBeVisible();
  });

  test('the lazy-load page renders products as they come into view', { tag: ['@catalog', '@medium'] }, async ({ page, dynamicCatalogPage }) => {
    await dynamicCatalogPage.gotoLazyLoad();
    // How many load up front depends on the screen size, so assert the order and that scrolling never loses items.
    await expect(dynamicCatalogPage.lazyItemNames.first()).toHaveText('Sauce Labs Bike Light');
    const initial = await dynamicCatalogPage.lazyItemNames.count();
    expect(initial).toBeGreaterThanOrEqual(3);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => dynamicCatalogPage.lazyItemNames.count()).toBeGreaterThanOrEqual(initial);
  });

  test('the spinner page loads all six products', { tag: ['@catalog', '@medium'] }, async ({ dynamicCatalogPage }) => {
    await dynamicCatalogPage.gotoSpinner();
    await expect(dynamicCatalogPage.spinnerItemNames).toHaveCount(6);
  });

  test('the slider page rotates through products', { tag: ['@catalog', '@low'] }, async ({ dynamicCatalogPage }) => {
    await dynamicCatalogPage.gotoSlider();
    const first = await dynamicCatalogPage.sliderProduct.textContent();
    await expect(dynamicCatalogPage.sliderProduct).not.toHaveText(first!, { timeout: 10_000 });
  });

  // ---- Intentional failure (excluded when DEMO_FAILURES=off, see playwright.config.ts) ----
  test('[Demo] the spinner catalog page loads within a 50 ms budget', { tag: ['@catalog', '@medium', '@demo-failure'] }, async ({ page }) => {
    await page.goto('/dynamic-catalog-spinner.html', { timeout: 50 });
    await expect(page).toHaveURL(/spinner/);
  });
});
