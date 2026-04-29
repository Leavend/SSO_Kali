#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
WORKFLOW="CI"
RELEASE_REF="${GITHUB_REF_NAME:-}"
RELEASE_SHA="${GITHUB_SHA:-}"
TIMEOUT_SECONDS=1800
INTERVAL_SECONDS=20

fail() {
  printf '[release-ci-gate][ERROR] %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[release-ci-gate] %s\n' "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

read_arg() {
  [ "$#" -ge 2 ] || fail "Missing value for $1"
  printf '%s' "$2"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO="$(read_arg "$@")"; shift 2 ;;
    --workflow) WORKFLOW="$(read_arg "$@")"; shift 2 ;;
    --ref) RELEASE_REF="$(read_arg "$@")"; shift 2 ;;
    --sha) RELEASE_SHA="$(read_arg "$@")"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="$(read_arg "$@")"; shift 2 ;;
    --interval) INTERVAL_SECONDS="$(read_arg "$@")"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

require_cmd gh
require_cmd jq
[ -n "$REPO" ] || fail "Repository is required"
[ -n "$WORKFLOW" ] || fail "Workflow name is required"
[ -n "$RELEASE_REF" ] || fail "Release ref is required"
[ -n "$RELEASE_SHA" ] || fail "Release commit sha is required"

find_release_run() {
  gh run list \
    --repo "$REPO" \
    --workflow "$WORKFLOW" \
    --branch "$RELEASE_REF" \
    --event push \
    --limit 20 \
    --json databaseId,status,conclusion,headSha,url,createdAt |
    jq -c --arg sha "$RELEASE_SHA" \
      'map(select(.headSha == $sha)) | sort_by(.createdAt) | last // empty'
}

deadline=$((SECONDS + TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  run_json="$(find_release_run || true)"
  if [ -z "$run_json" ]; then
    log "Waiting for CI run on ${RELEASE_REF} (${RELEASE_SHA})"
  else
    status="$(printf '%s' "$run_json" | jq -r '.status')"
    conclusion="$(printf '%s' "$run_json" | jq -r '.conclusion // ""')"
    run_url="$(printf '%s' "$run_json" | jq -r '.url')"
    log "CI status=${status} conclusion=${conclusion:-pending} url=${run_url}"

    if [ "$status" = "completed" ]; then
      [ "$conclusion" = "success" ] && exit 0
      fail "Release CI did not pass before deployment: ${conclusion}"
    fi
  fi
  sleep "$INTERVAL_SECONDS"
done

fail "Timed out waiting for successful release CI"
