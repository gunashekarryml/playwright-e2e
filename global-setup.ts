import { chromium } from '@playwright/test';
import { users } from './fixtures/testData';

export const STANDARD_USER_STORAGE_STATE = 'playwright/.auth/standard.json';

/**
 * Logs in once as the standard user and saves the session so cart/checkout
 * specs can start already authenticated instead of repeating the login flow
 * in every beforeEach. Login-flow tests themselves stay unauthenticated.
 */
export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: process.env.BASE_URL || 'https://www.saucedemo.com' });

  await page.goto('/');
  await page.getByPlaceholder('Username').fill(users.standard.username);
  await page.getByPlaceholder('Password').fill(users.standard.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/inventory.html');

  await page.context().storageState({ path: STANDARD_USER_STORAGE_STATE });
  await browser.close();
}
