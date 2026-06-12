#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONTENT_SOURCE_ROOT="${CONTENT_SOURCE_ROOT:-${PROJECT_ROOT}/docs}"
DEVELOPERS_SOURCE="${CONTENT_SOURCE_ROOT}/developers"
ONBOARDING_SOURCE="${CONTENT_SOURCE_ROOT}/onboarding"

log() {
  printf '[sync-content] %s\n' "$*"
}

require_directory() {
  if [ ! -d "$1" ]; then
    printf '[sync-content] missing source directory: %s\n' "$1" >&2
    exit 1
  fi
}

rewrite_onboarding_link() {
  local file="$1"
  local target="$2"
  local temporary

  temporary="$(mktemp)"
  sed \
    -e "s|](../onboarding/client-web-app-onboarding.md)|](${target})|g" \
    -e "s|](../../onboarding/en/client-web-app-onboarding.md)|](${target})|g" \
    "${file}" > "${temporary}"
  mv "${temporary}" "${file}"
}

require_directory "${DEVELOPERS_SOURCE}"
require_directory "${ONBOARDING_SOURCE}"

log "Removing previously generated documentation"
rm -f \
  "${SCRIPT_DIR}/index.md" \
  "${SCRIPT_DIR}/api-reference.md" \
  "${SCRIPT_DIR}/errors.md" \
  "${SCRIPT_DIR}/resource-server.md" \
  "${SCRIPT_DIR}/scopes-and-claims.md" \
  "${SCRIPT_DIR}/security-model.md" \
  "${SCRIPT_DIR}/onboarding.md"
rm -rf "${SCRIPT_DIR}/integrations" "${SCRIPT_DIR}/en"

log "Copying the complete developer documentation tree"
cp -R "${DEVELOPERS_SOURCE}/." "${SCRIPT_DIR}/"
mv "${SCRIPT_DIR}/README.md" "${SCRIPT_DIR}/index.md"
rewrite_onboarding_link "${SCRIPT_DIR}/index.md" '/onboarding'

log "Mapping localized onboarding pages"
cp "${ONBOARDING_SOURCE}/client-web-app-onboarding.md" "${SCRIPT_DIR}/onboarding.md"
mkdir -p "${SCRIPT_DIR}/en"
cp "${ONBOARDING_SOURCE}/en/client-web-app-onboarding.md" "${SCRIPT_DIR}/en/onboarding.md"
mv "${SCRIPT_DIR}/en/README.md" "${SCRIPT_DIR}/en/index.md"
rewrite_onboarding_link "${SCRIPT_DIR}/en/index.md" '/en/onboarding'

log "Content sync complete"
