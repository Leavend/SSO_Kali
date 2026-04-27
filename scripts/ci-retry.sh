#!/usr/bin/env bash
set -Eeuo pipefail

max_attempts="${CI_RETRY_ATTEMPTS:-5}"
delay_seconds="${CI_RETRY_DELAY_SECONDS:-10}"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "CI_RETRY_ATTEMPTS must be a positive integer" >&2
  exit 2
fi

if ! [[ "$delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "CI_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
  exit 2
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: ci-retry.sh <command> [args...]" >&2
  exit 2
fi

attempt=1
last_status=0

while [ "$attempt" -le "$max_attempts" ]; do
  if "$@"; then
    exit 0
  fi

  last_status=$?
  if [ "$attempt" -eq "$max_attempts" ]; then
    break
  fi

  echo "Attempt ${attempt}/${max_attempts} failed with ${last_status}; retrying in ${delay_seconds}s..." >&2
  sleep "$delay_seconds"
  attempt=$((attempt + 1))
done

echo "Command failed after ${max_attempts} attempts: $*" >&2
exit "$last_status"
