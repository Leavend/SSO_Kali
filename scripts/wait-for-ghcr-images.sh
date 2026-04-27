#!/usr/bin/env bash

set -Eeuo pipefail

TAG=""
REGISTRY="ghcr.io/leavend/sso-prototype"
TIMEOUT_SECONDS=900
INTERVAL_SECONDS=15

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift ;;
    --registry) REGISTRY="$2"; shift ;;
    --timeout) TIMEOUT_SECONDS="$2"; shift ;;
    --interval) INTERVAL_SECONDS="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

[[ -n "$TAG" ]] || { echo "ERROR: --tag required" >&2; exit 1; }
[[ -n "$REGISTRY" ]] || { echo "ERROR: --registry required" >&2; exit 1; }

TAG="${TAG#v}"
IMAGES=(
  sso-backend
  sso-frontend
  sso-admin-vue
  zitadel-login
  zitadel-login-vue
  app-a-next
  app-b-laravel
)

log() { printf '[ghcr-gate] %s\n' "$*"; }
fail() { printf '[ghcr-gate][FAIL] %s\n' "$*" >&2; exit 1; }

deadline=$((SECONDS + TIMEOUT_SECONDS))
pending=("${IMAGES[@]}")

log "Waiting for ${#pending[@]} image manifest(s) with tag ${TAG}"

while ((${#pending[@]} > 0)); do
  next_pending=()

  for image in "${pending[@]}"; do
    ref="${REGISTRY}/${image}:${TAG}"
    if docker manifest inspect "$ref" >/dev/null 2>&1; then
      log "Available: $ref"
    else
      next_pending+=("$image")
    fi
  done

  if ((${#next_pending[@]} == 0)); then
    log "All release image manifests are available"
    exit 0
  fi

  if ((SECONDS >= deadline)); then
    fail "Timed out waiting for: ${next_pending[*]}"
  fi

  log "Still waiting for: ${next_pending[*]}"
  sleep "$INTERVAL_SECONDS"
  pending=("${next_pending[@]}")
done
