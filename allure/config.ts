/**
 * Populates the Allure "Environment" widget. Falls back to 'local' values
 * outside CI so the widget is still meaningful when generating a report on
 * a laptop.
 */
export function allureEnvironmentInfo(): Record<string, string> {
  return {
    'Application URL': process.env.BASE_URL ?? 'https://www.saucedemo.com',
    Browsers: 'chromium, firefox, webkit, mobile-chrome',
    'Node Version': process.version,
    'CI Provider': process.env.CI ? 'GitHub Actions' : 'local',
    'Triggered By': process.env.GITHUB_EVENT_NAME ?? 'local run',
    Branch: process.env.GITHUB_REF_NAME ?? 'local',
    Commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local',
  };
}

/** Custom defect categories shown in the Allure "Categories" tab. */
export const allureCategories = [
  {
    name: 'Product defects',
    matchedStatuses: ['failed'],
    messageRegex: '.*(expect|toHaveText|toBeVisible|toEqual|toContainText|toHaveCount).*',
  },
  {
    name: 'Test/framework defects',
    matchedStatuses: ['broken'],
  },
  {
    name: 'Environment issues',
    matchedStatuses: ['failed', 'broken'],
    traceRegex: '.*(Timeout|ECONNRESET|net::ERR|browserType\\.launch).*',
  },
  {
    name: 'Ignored tests',
    matchedStatuses: ['skipped'],
  },
];
