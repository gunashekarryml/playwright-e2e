// Rule-based failure classification shared by analyze-results.js and build-dashboard-run.js.
// First matching rule wins, most specific first. Each rule carries plain-language text so the
// dashboard can explain a failure to a non-technical reader:
//   cause   product | test | env   (bucket used by the dashboard charts)
//   label   short plain-English root cause
//   meaning what it usually means for the product
//   action  the suggested next step, owner who should look first
const has = (re) => (m) => re.test(m);
// A real comparison failure: the page produced a value and it was not the expected one.
const isValueMismatch = (m) => /Expected[^\n]*:/.test(m) && /Received[^\n]*:/.test(m) && !/Received[^\n]*:\s*<element\(s\) not found>/.test(m);

const RULES = [
  {
    category: 'Network / environment', cause: 'env', confidence: 'High',
    label: 'Environment problem',
    meaning: 'The test could not reach the site or a service it depends on, so the check never really ran. This is usually not a product defect.',
    action: 'Check the environment is up, then re-run.', owner: 'DevOps / Platform',
    hint: 'Target site or network was unreachable; check app status and rerun.',
    test: has(/net::ERR|NS_ERROR_(CONNECTION|NET|UNKNOWN_HOST)|ECONNREFUSED|ECONNRESET|ENOTFOUND|getaddrinfo|Could not connect to the server|\b50[0-4]\b|socket hang up/i),
  },
  {
    category: 'Assertion failure', cause: 'product', confidence: 'Medium',
    label: 'Product behaves differently than expected',
    meaning: 'The site showed or did something other than what the requirement says. Either the product has a defect, or the requirement changed and the test is out of date.',
    action: 'Compare expected and actual. If the site is wrong, raise a defect; if the requirement changed, update the test.', owner: 'Product / Dev',
    hint: 'App behaved differently from the expectation; likely a real bug or outdated expectation.',
    test: isValueMismatch,
  },
  {
    category: 'Timing / timeout', cause: 'product', confidence: 'Medium',
    label: 'Page too slow or not responding',
    meaning: 'A page did not load or respond within the time limit. Usually a slow environment or a performance problem.',
    action: 'Re-run to rule out a one-off. If it repeats, treat it as a performance defect.', owner: 'Dev / Performance',
    hint: 'Operation was too slow; check for slow users or add a proper wait condition.',
    test: has(/page\.(goto|waitForURL|reload|waitForLoadState|waitForNavigation)[^\n]*Timeout|Navigation[^\n]*timeout|Test timeout of/i),
  },
  {
    category: 'Locator / UI change', cause: 'test', confidence: 'Medium',
    label: 'Screen element missing or changed',
    meaning: 'The test could not find a button, field or text it expects. Either the screen changed, the feature is not built yet, or part of the page did not load.',
    action: 'Open the screenshot. If the change is intended, update the test; if not, raise a defect.', owner: 'QA to confirm, then Dev',
    hint: 'Element missing or ambiguous; the UI or the locator likely changed.',
    test: has(/strict mode violation|waiting for (getBy|locator)|element\(s\) not found|locator\.\w+: Timeout|resolved to 0 elements/i),
  },
  {
    category: 'Test setup / code error', cause: 'test', confidence: 'High',
    label: 'Test script problem',
    meaning: 'A fault in the automation itself, not in the product.',
    action: 'QA to fix the test.', owner: 'QA',
    hint: 'Error in test or page object code, not the app.',
    test: has(/TypeError|ReferenceError|SyntaxError|Cannot read prop|is not a function|undefined/i),
  },
  {
    category: 'Timing / timeout', cause: 'product', confidence: 'Low',
    label: 'Page too slow or not responding',
    meaning: 'An operation did not finish within the time limit.',
    action: 'Re-run to rule out a one-off. If it repeats, investigate performance.', owner: 'Dev / Performance',
    hint: 'Operation was too slow; check for slow users or add a proper wait condition.',
    test: has(/Timeout \d+ms exceeded|timed out/i),
  },
  {
    category: 'Assertion failure', cause: 'product', confidence: 'Low',
    label: 'Product behaves differently than expected',
    meaning: 'A check on the page did not hold.',
    action: 'Compare expected and actual, then decide if it is a defect or an outdated test.', owner: 'Product / Dev',
    hint: 'App behaved differently from the expectation; likely a real bug or outdated expectation.',
    test: has(/expect\(|toHave|toBe|toEqual|toContain|toMatch/),
  },
];
const FALLBACK = {
  category: 'Unclassified', cause: 'product', confidence: 'Low',
  label: 'Needs investigation',
  meaning: 'The error did not match a known pattern.',
  action: 'Open the trace to find out what happened.', owner: 'QA',
  hint: 'No rule matched; inspect the trace.',
};

const clean = (s = '') => String(s).trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ');
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const num = (s) => (/^-?\d+\.\d{3,}$/.test(s) ? String(Math.round(parseFloat(s) * 100) / 100) : s);

// Turns the first locator mentioned in Playwright's call log into words.
function describeLocator(message) {
  const m = /waiting for ((?:getBy\w+|locator)\(.*?\))(?:\s|$)/s.exec(message) ?? /Locator:\s*(.+)/.exec(message);
  const raw = (m?.[1] ?? '').split('\n')[0].trim();
  let r;
  if ((r = /getByPlaceholder\('(.+?)'\)/.exec(raw))) return `a field with the placeholder “${r[1]}”`;
  if ((r = /getByRole\('(\w+)'(?:,\s*\{\s*name:\s*['/]*(.+?)['/]*[,\s]*(?:i|exact: true)?\s*\})?/.exec(raw))) return r[2] ? `a “${r[2].replace(/['/]+$/, '')}” ${r[1]}` : `a ${r[1]}`;
  if ((r = /getByText\('(.+?)'\)/.exec(raw))) return `the text “${r[1]}”`;
  if ((r = /getByLabel\('(.+?)'\)/.exec(raw))) return `a field labelled “${r[1]}”`;
  if ((r = /data-test="([^"]+)"/.exec(raw))) return `the “${r[1]}” element`;
  if (raw) return `the element ${short(raw, 60)}`;
  return 'the expected element';
}

// Plain-English "what happened" plus the expected / actual values when the page produced one.
function explain(message, category) {
  const first = message.split('\n').find((l) => l.trim()) ?? '';
  const exp = /^Expected[^\n:]*:\s*(.+)$/m.exec(message)?.[1];
  const rec = /^Received[^\n:]*:\s*(.+)$/m.exec(message)?.[1];
  const expected = exp ? short(num(clean(exp))) : undefined;
  const received = rec && !/element\(s\) not found/.test(rec) ? short(num(clean(rec))) : undefined;

  if (category === 'Assertion failure') {
    if (/toHaveCount/.test(message) && expected && received) return { what: `Expected ${expected} items but found ${received}.`, expected, received };
    if (expected && received) return { what: `Expected “${expected}” but the page showed “${received}”.`, expected, received };
    return { what: short(clean(first), 160) };
  }
  if (category === 'Locator / UI change') return { what: `Could not find ${describeLocator(message)} on the page.` };
  if (category === 'Timing / timeout') {
    const ms = /Timeout (\d+)ms/.exec(message)?.[1];
    const limit = ms ? (Number(ms) >= 1000 ? `${Number(ms) / 1000} s` : `${ms} ms`) : 'the time limit';
    const where = /waitForURL/.test(message) ? 'reach the expected page' : /goto|navigat|reload|waitForLoadState/i.test(message) ? 'finish loading' : 'respond';
    return { what: `The page did not ${where} within ${limit}.` };
  }
  if (category === 'Network / environment') {
    const url = /(https?:\/\/[^\s"]+)/.exec(message)?.[1];
    return { what: url ? `Could not connect to ${short(url, 70)}.` : 'Could not connect to the site.' };
  }
  return { what: short(clean(first), 160) };
}

const classify = (message = '') => {
  const rule = RULES.find((r) => r.test(message)) ?? FALLBACK;
  const { category, cause, hint, label, meaning, action, owner, confidence } = rule;
  return { category, cause, hint, label, meaning, action, owner, confidence, ...explain(message, category) };
};

// Rule text shared once per run instead of repeated on every failed check.
const causeInfo = (category) => {
  const r = RULES.find((x) => x.category === category) ?? FALLBACK;
  return { cause: r.cause, label: r.label, meaning: r.meaning, action: r.action, owner: r.owner, confidence: r.confidence };
};

module.exports = { classify, causeInfo };
