#!/usr/bin/env bash
# Sync content from repo root for local development
# This script copies markdown files from docs/ to the VitePress root

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() {
  printf '[sync-content] %s\n' "$*"
}

log "Syncing content from ${PROJECT_ROOT}/docs/developers/ to VitePress root"

# Sync developer docs directly to root (VitePress expects markdown at root)
log "Syncing docs/developers/*.md to root"
cp "${PROJECT_ROOT}/docs/developers/api-reference.md" "${SCRIPT_DIR}/api-reference.md"
cp "${PROJECT_ROOT}/docs/developers/scopes-and-claims.md" "${SCRIPT_DIR}/scopes-and-claims.md"
cp "${PROJECT_ROOT}/docs/developers/errors.md" "${SCRIPT_DIR}/errors.md"
cp "${PROJECT_ROOT}/docs/developers/security-model.md" "${SCRIPT_DIR}/security-model.md"
cp "${PROJECT_ROOT}/docs/developers/resource-server.md" "${SCRIPT_DIR}/resource-server.md"

# Sync onboarding
log "Syncing docs/onboarding/client-web-app-onboarding.md"
cp "${PROJECT_ROOT}/docs/onboarding/client-web-app-onboarding.md" "${SCRIPT_DIR}/onboarding.md"

# Copy README and rewrite the onboarding link for VitePress
log "Copying README.md as index.md with link rewrite"
cp "${PROJECT_ROOT}/docs/developers/README.md" "${SCRIPT_DIR}/index.md"
sed -i '' 's|\](../onboarding/client-web-app-onboarding.md)|](/onboarding)|g' "${SCRIPT_DIR}/index.md"

log "Content sync complete!"
