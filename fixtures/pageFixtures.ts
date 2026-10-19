import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { MenuPage } from '../pages/MenuPage';
import { ProductDetailsPage } from '../pages/ProductDetailsPage';
import { DynamicCatalogPage } from '../pages/DynamicCatalogPage';

/**
 * Extends Playwright's base test with ready-to-use Page Objects,
 * so specs never instantiate them manually. Import `test`/`expect`
 * from this file instead of '@playwright/test' in every spec.
 */
type Pages = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  menuPage: MenuPage;
  productDetailsPage: ProductDetailsPage;
  dynamicCatalogPage: DynamicCatalogPage;
};

export const test = base.extend<Pages>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  menuPage: async ({ page }, use) => {
    await use(new MenuPage(page));
  },
  productDetailsPage: async ({ page }, use) => {
    await use(new ProductDetailsPage(page));
  },
  dynamicCatalogPage: async ({ page }, use) => {
    await use(new DynamicCatalogPage(page));
  },
});

export { expect } from '@playwright/test';
