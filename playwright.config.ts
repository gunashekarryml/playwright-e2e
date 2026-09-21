import { defineConfig, devices } from '@playwright/test';
import { allureEnvironmentInfo, allureCategories } from './allure/config';

/**
 * Central Playwright configuration.
 * Docs: https://playwright.dev/docs/test-configuration
 */
const allureReporter = [
  'allure-playwright',
  {
    resultsDir: 'allure-results',
    environmentInfo: allureEnvironmentInfo(),
    categories: allureCategories,
  },
] as const;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['html', { open: 'never' }],
        ['list'],
        allureReporter,
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [
        ['html', { open: 'never' }],
        ['list'],
        allureReporter,
      ],

  use: {
    baseURL: process.env.BASE_URL || 'https://www.saucedemo.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
