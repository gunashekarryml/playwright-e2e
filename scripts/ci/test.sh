#!/usr/bin/env bash
# Stage 1 (one per browser project): install, run tests, post-process results.
# Usage: scripts/ci/test.sh <project>
# Env: ENVIRONMENT, SUITE, GREP_INPUT, EVENT, BASE_URL_OVERRIDE, QA_URL/DEV_URL/STAGING_URL/PROD_URL, DEMO_FAILURES
set -uo pipefail
PROJECT="${1:?usage: test.sh <project>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

npm ci
# global-setup.ts always logs in through Chromium, so it is needed for every project, plus the project's own browser.
BROWSER="$PROJECT"; [ "$PROJECT" = mobile-chrome ] && BROWSER=chromium
npx playwright install --with-deps chromium $([ "$BROWSER" != chromium ] && echo "$BROWSER")

export BASE_URL="$("$HERE/resolve-url.sh")"
GREP="$("$HERE/scope.sh")"
echo "Project: $PROJECT | URL: $BASE_URL | grep: ${GREP:-<none>}"

if [ -n "$GREP" ]; then
  npx playwright test --project="$PROJECT" --grep "$GREP"
else
  npx playwright test --project="$PROJECT"
fi
STATUS=$?

# Post-processing must never mask the test result.
node scripts/report-flaky.js test-results/results.json || true
node scripts/analyze-results.js test-results/results.json test-results/analysis.json || true
exit $STATUS
