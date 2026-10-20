#!/usr/bin/env bash
# Prints the Playwright --grep expression for a run. Single source of truth for suite -> tag mapping.
# Inputs (env): SUITE, GREP_INPUT, EVENT (e.g. pull_request)
set -euo pipefail

case "${SUITE:-}" in
  "Smoke") SUITE_TAG="@smoke" ;;
  "Login") SUITE_TAG="@login" ;;
  "Product Listing") SUITE_TAG="@inventory" ;;
  "Product Details") SUITE_TAG="@product" ;;
  "Cart") SUITE_TAG="@cart" ;;
  "Checkout") SUITE_TAG="@checkout" ;;
  "Menu & Navigation") SUITE_TAG="@menu" ;;
  "Dynamic Catalog") SUITE_TAG="@catalog" ;;
  "Accessibility") SUITE_TAG="@a11y" ;;
  "User Profiles") SUITE_TAG="@users" ;;
  *) SUITE_TAG="" ;;   # Full Regression, scheduled runs
esac
[ "${EVENT:-}" = "pull_request" ] && SUITE_TAG="@smoke"

# Both filters must match, so chain them as regex look-aheads.
GREP=""
[ -n "$SUITE_TAG" ] && GREP="(?=.*$SUITE_TAG)"
[ -n "${GREP_INPUT:-}" ] && GREP="$GREP(?=.*$GREP_INPUT)"
printf '%s' "$GREP"
