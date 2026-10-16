// Rule-based failure classification shared by analyze-results.js and
// build-dashboard-run.js. First matching rule wins: most specific first.
// `cause` is the dashboard bucket: product | test | env.
const RULES = [
  { category: 'Network / environment', cause: 'env', test: /net::ERR|ECONNREFUSED|ECONNRESET|ENOTFOUND|getaddrinfo|\b50[0-4]\b|socket hang up/i,
    hint: 'Target site or network was unreachable; check app status and rerun.' },
  { category: 'Locator / UI change', cause: 'test', test: /strict mode violation|waiting for (getBy|locator)|element\(s\) not found|locator\..*Timeout|resolved to 0 elements/i,
    hint: 'Element missing or ambiguous; the UI or the locator likely changed.' },
  { category: 'Timing / timeout', cause: 'test', test: /Timeout \d+ms exceeded|Test timeout|timed out|waitFor.*Timeout|Navigation.*timeout/i,
    hint: 'Operation was too slow; check for slow users (performance_glitch_user) or add a proper wait condition.' },
  { category: 'Assertion failure', cause: 'product', test: /expect\(|toHave|toBe|toEqual|toContain|toMatch|Expected|Received/,
    hint: 'App behaved differently from the expectation; likely a real bug or outdated expectation.' },
  { category: 'Test setup / code error', cause: 'test', test: /TypeError|ReferenceError|SyntaxError|Cannot read prop|is not a function|undefined/i,
    hint: 'Error in test or page object code, not the app.' },
];
const FALLBACK = { category: 'Unclassified', cause: 'product', hint: 'No rule matched; inspect the trace.' };

const classify = (message = '') => {
  const { category, cause, hint } = RULES.find((r) => r.test.test(message)) ?? FALLBACK;
  return { category, cause, hint };
};

module.exports = { classify };
