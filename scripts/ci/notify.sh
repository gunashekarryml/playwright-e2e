#!/usr/bin/env bash
# Stage 4: post the result to Slack.
# Expects ./dashboard-input/json-results-*/results.json.
# Env: SITE_URL, WORKFLOW_RESULT, QA_WORKFLOW_FILE, SLACK_BOT_TOKEN + SLACK_CHANNEL_ID or SLACK_WEBHOOK_URL, REQUESTED_BY, SLACK_RUN_FORM
set -euo pipefail
SITE_URL="${SITE_URL%/}"

# Names the dashboard builder expects.
export TEST_ENV="${ENVIRONMENT:-Default}" TEST_SUITE="${SUITE:-Full Regression}" TEST_FILTER="${GREP_INPUT:-}"

if [ -z "${SLACK_WEBHOOK_URL:-}" ] && { [ -z "${SLACK_BOT_TOKEN:-}" ] || [ -z "${SLACK_CHANNEL_ID:-}" ]; }; then
  echo "Slack not configured; skipping."; exit 0
fi

npm ci
export DASHBOARD_URL="$SITE_URL/dashboard/"
export ALLURE_URL="$SITE_URL/"
export ALLURE_RUN_URL="$SITE_URL/latest-run/"
export ACTOR="${GITHUB_ACTOR:-}"
export WORKFLOW_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/workflows/${QA_WORKFLOW_FILE:-qa-trigger.yml}"

node scripts/build-dashboard-run.js dashboard-input run.json
node scripts/notify-slack.js run.json
