#!/usr/bin/env bash
set -euo pipefail

SLACK_WEBHOOK="${ALERTMANAGER_SLACK_WEBHOOK_URL:-}"
PAGERDUTY_KEY="${ALERTMANAGER_PAGERDUTY_ROUTING_KEY:-}"

require_value() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    printf '[validate-oncall-routing][ERROR] %s is required\n' "$name" >&2
    exit 1
  fi

  if [[ "$value" == *'example'* || "$value" == *'changeme'* ]]; then
    printf '[validate-oncall-routing][ERROR] %s still looks like a placeholder\n' "$name" >&2
    exit 1
  fi
}

require_value "ALERTMANAGER_SLACK_WEBHOOK_URL" "$SLACK_WEBHOOK"
require_value "ALERTMANAGER_PAGERDUTY_ROUTING_KEY" "$PAGERDUTY_KEY"

printf '[validate-oncall-routing] OK\n'
