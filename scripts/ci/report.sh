#!/usr/bin/env bash
# Stage 2: merge per-project Allure results into one report. Needs Java 17+ on the runner.
# Expects ./allure-results already populated from all projects.
# Env: SITE_URL (published site, for trend history), GITHUB_* (provided by the runner)
set -euo pipefail
SITE_URL="${SITE_URL%/}"

npm ci

mkdir -p allure-results/history
if [ -n "$SITE_URL" ]; then
  for f in history.json history-trend.json categories-trend.json duration-trend.json retry-trend.json; do
    curl -sSf "$SITE_URL/history/$f" -o "allure-results/history/$f" || rm -f "allure-results/history/$f"
  done
fi

cat > allure-results/executor.json <<JSON
{
  "name": "GitHub Actions (dev repo)",
  "type": "github",
  "url": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions",
  "buildOrder": ${GITHUB_RUN_NUMBER},
  "buildName": "Run #${GITHUB_RUN_NUMBER} (${GITHUB_EVENT_NAME})",
  "buildUrl": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
  "reportUrl": "${SITE_URL}/",
  "reportName": "Allure Report"
}
JSON

npm run report:allure:generate
