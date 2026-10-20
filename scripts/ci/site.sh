#!/usr/bin/env bash
# Stage 3: build the Pages site (dashboard + Allure) into ./site, ready for upload-pages-artifact.
# Expects: ./allure-run (merged report), ./dashboard-input/json-results-*/results.json,
#          optionally ./last-full-report (restored from cache).
# Env: SITE_URL, HISTORY_REMOTE (authenticated git URL of the repo that owns Pages), GITHUB_OUTPUT
set -euo pipefail
SITE_URL="${SITE_URL%/}"

# Names the dashboard builder expects.
export TEST_ENV="${ENVIRONMENT:-Default}" TEST_SUITE="${SUITE:-Full Regression}" TEST_FILTER="${GREP_INPUT:-}"

npm ci

mkdir -p site/dashboard/data
rm -f history-backup.json
if [ -n "${HISTORY_REMOTE:-}" ]; then
  tmp="$(mktemp -d)"
  ( cd "$tmp" && git init -q && git remote add origin "$HISTORY_REMOTE" \
    && git fetch -q --depth=1 origin dashboard-data && git show FETCH_HEAD:runs.json > "$OLDPWD/history-backup.json" ) \
    || echo "No history backup yet."
fi

# Never starts from an empty history unless this is the very first run: live site, else backup branch, else stop.
backup=""; [ -f history-backup.json ] && backup="history-backup.json"
node scripts/fetch-dashboard-history.js "$SITE_URL/dashboard/data/runs.json" site/dashboard/data/runs.json $backup
cp dashboard/index.html site/dashboard/index.html
node scripts/build-dashboard-run.js dashboard-input run.json
node scripts/update-dashboard-history.js run.json site/dashboard/data/runs.json
SCOPE="$(node -p "require('./run.json').scope")"
echo "scope=$SCOPE" >> "${GITHUB_OUTPUT:-/dev/null}"

# Back up the history on the dashboard-data branch (best effort).
if [ -n "${HISTORY_REMOTE:-}" ]; then
  (
    set -e
    d="$(mktemp -d)"; cd "$d"
    git init -q
    git config user.name "qa-automation[bot]"
    git config user.email "qa-automation@users.noreply.github.com"
    git remote add origin "$HISTORY_REMOTE"
    if git fetch -q --depth=1 origin dashboard-data; then git checkout -q -B dashboard-data FETCH_HEAD; else git checkout -q --orphan dashboard-data; fi
    cp "$OLDPWD/site/dashboard/data/runs.json" runs.json
    git add runs.json
    git commit -q -m "Dashboard history after run #${GITHUB_RUN_NUMBER:-0}" || exit 0
    git push -q origin dashboard-data
  ) || echo "History backup skipped."
fi

# A smoke or feature run must not replace the full-regression report: the root keeps the last full one.
if [ "$SCOPE" = "full" ] || [ ! -d last-full-report ]; then
  cp -R allure-run/. site/
else
  cp -R last-full-report/. site/
fi
mkdir -p site/latest-run
cp -R allure-run/. site/latest-run/

# Hand this run's report back to the workflow so it can cache it as the next "last full report".
if [ "$SCOPE" = "full" ]; then
  rm -rf last-full-report && cp -R allure-run last-full-report
fi
