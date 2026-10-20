#!/usr/bin/env bash
# Prints the base URL under test. Priority: override > environment URL > BASE_URL > public demo.
# Inputs (env): BASE_URL_OVERRIDE, ENVIRONMENT, QA_URL, DEV_URL, STAGING_URL, PROD_URL, BASE_URL
set -euo pipefail
url="${BASE_URL_OVERRIDE:-}"
if [ -z "$url" ]; then
  case "${ENVIRONMENT:-}" in
    QA) url="${QA_URL:-}" ;;
    DEV) url="${DEV_URL:-}" ;;
    STAGING) url="${STAGING_URL:-}" ;;
    PROD) url="${PROD_URL:-}" ;;
  esac
fi
printf '%s' "${url:-${BASE_URL:-https://www.saucedemo.com}}"
