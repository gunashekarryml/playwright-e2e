/** Centralized test data / credentials for the SauceDemo demo app. */
export const users = {
  standard: { username: 'standard_user', password: 'secret_sauce' },
  lockedOut: { username: 'locked_out_user', password: 'secret_sauce' },
  problem: { username: 'problem_user', password: 'secret_sauce' },
  performanceGlitch: { username: 'performance_glitch_user', password: 'secret_sauce' },
  error: { username: 'error_user', password: 'secret_sauce' },
  visual: { username: 'visual_user', password: 'secret_sauce' },
};

export const customer = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  postalCode: '94107',
};

/** The six products in the catalog, in default (A to Z) order. */
export const products = [
  { name: 'Sauce Labs Backpack', price: 29.99, id: 4 },
  { name: 'Sauce Labs Bike Light', price: 9.99, id: 0 },
  { name: 'Sauce Labs Bolt T-Shirt', price: 15.99, id: 1 },
  { name: 'Sauce Labs Fleece Jacket', price: 49.99, id: 5 },
  { name: 'Sauce Labs Onesie', price: 7.99, id: 2 },
  { name: 'Test.allTheThings() T-Shirt (Red)', price: 15.99, id: 3 },
] as const;

export const TAX_RATE = 0.08;

export const socialLinks = [
  { key: 'x', host: 'x.com' },
  { key: 'facebook', host: 'facebook.com' },
  { key: 'linkedin', host: 'linkedin.com' },
] as const;
