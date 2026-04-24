#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

pass() {
  printf '[sso-frontend-vue-lifecycle][PASS] %s\n' "$*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[sso-frontend-vue-lifecycle][FAIL] %s\n' "$*" >&2
}

require_file() {
  local path="$1"
  if [[ -f "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
  fi
}

require_dir() {
  local path="$1"
  if [[ -d "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
  fi
}

require_absent() {
  local path="$1"
  if [[ ! -e "$ROOT_DIR/$path" ]]; then
    pass "Absent $path"
  else
    fail "Unexpected legacy artifact remains: $path"
  fi
}

require_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

reject_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    fail "$label"
  else
    pass "$label"
  fi
}

require_file "services/sso-frontend/package.json"
require_file "services/sso-frontend/package-lock.json"
require_file "services/sso-frontend/Dockerfile"
require_file "services/sso-frontend/vite.config.ts"
require_file "services/sso-frontend/tsconfig.app.json"
require_file "services/sso-frontend/tsconfig.server.json"
require_file "services/sso-frontend/vitest.config.ts"
require_file "services/sso-frontend/eslint.config.ts"
require_file "services/sso-frontend/scripts/smoke-built-server.mjs"
require_file "services/sso-frontend/src/server/index.ts"
require_file "services/sso-frontend/src/server/auth-handlers.ts"
require_file "services/sso-frontend/src/server/session-crypto.ts"
require_file "services/sso-frontend/src/server/cookies.ts"
require_file "services/sso-frontend/src/web/main.ts"
require_file "services/sso-frontend/src/web/router/index.ts"
require_file "services/sso-frontend/src/web/stores/admin.ts"
require_file "services/sso-frontend/src/__tests__/session-crypto.test.ts"
require_file "docs/generated/sso-frontend-vue-rebuild-runbook-2026-04-24.md"

require_dir "services/sso-frontend/src/server"
require_dir "services/sso-frontend/src/web"
require_dir "services/sso-frontend/src/shared"

require_absent "services/sso-frontend/next.config.ts"
require_absent "services/sso-frontend/playwright.config.ts"
require_absent "services/sso-frontend/src/app"
require_absent "services/sso-frontend/src/lib"

python3 - <<'PY' "$ROOT_DIR/services/sso-frontend/package.json" "$ROOT_DIR/services/sso-frontend/package-lock.json"
from __future__ import annotations

import json
import sys
from pathlib import Path

pkg_path = Path(sys.argv[1])
lock_path = Path(sys.argv[2])
pkg = json.loads(pkg_path.read_text())
lock = json.loads(lock_path.read_text())
deps = {}
for key in ("dependencies", "devDependencies"):
    deps.update(pkg.get(key, {}))

required_manifest = {
    "vue": "^3.5.33",
    "vite": "^8.0.10",
    "vue-router": "^5.0.6",
    "pinia": "^3.0.4",
    "@vitejs/plugin-vue": "^6.0.6",
}

required_lock = {
    "vue": "3.5.33",
    "vite": "8.0.10",
    "vue-router": "5.0.6",
    "pinia": "3.0.4",
    "@vitejs/plugin-vue": "6.0.6",
}

for name, expected in required_manifest.items():
    actual = deps.get(name)
    if actual != expected:
        raise SystemExit(
            f"[sso-frontend-vue-lifecycle][FAIL] {name} manifest version is {actual!r}, expected {expected!r}"
        )

for name in ("next", "react", "react-dom"):
    if name in deps:
        raise SystemExit(f"[sso-frontend-vue-lifecycle][FAIL] forbidden legacy dependency remains: {name}")

packages = lock.get("packages", {})
for name, expected in required_lock.items():
    actual = packages.get(f"node_modules/{name}", {}).get("version")
    if actual != expected:
        raise SystemExit(
            f"[sso-frontend-vue-lifecycle][FAIL] {name} lock version is {actual!r}, expected {expected!r}"
        )

print("[sso-frontend-vue-lifecycle][PASS] Vue/Vite stack is locked to expected latest versions")
print("[sso-frontend-vue-lifecycle][PASS] Next/React dependencies are removed from primary SSO frontend")
PY

require_text "services/sso-frontend/package.json" '"build": "run-s typecheck build:web build:server"' "Frontend build runs typecheck before web/server builds"
require_text "services/sso-frontend/package.json" '"lint": "run-s lint:eslint security:broker security:storage"' "Frontend lint includes broker and storage security gates"
require_text "services/sso-frontend/package.json" '"smoke": "node scripts/smoke-built-server.mjs"' "Frontend exposes production artifact smoke test"
require_text ".github/workflows/ci.yml" 'npm run --if-present smoke' "CI runs production smoke tests when available"
require_text "services/sso-frontend/src/server/index.ts" "pathname === '/healthz'" "BFF exposes health endpoint"
require_text "services/sso-frontend/src/server/index.ts" "pathname === '/auth/login'" "BFF owns login endpoint"
require_text "services/sso-frontend/src/server/index.ts" "pathname === '/auth/callback'" "BFF owns callback endpoint"
require_text "services/sso-frontend/src/server/index.ts" "pathname === '/auth/refresh'" "BFF owns refresh endpoint"
require_text "services/sso-frontend/src/server/index.ts" "pathname\\.startsWith\\('/api/admin/'\\)" "BFF proxies admin API through same-origin route"
require_text "services/sso-frontend/src/server/auth-handlers.ts" 'generateCodeChallenge' "PKCE code challenge is generated server-side"
require_text "services/sso-frontend/src/server/auth-handlers.ts" 'jwtVerify' "ID token verification remains server-side"
require_text "services/sso-frontend/src/server/session-crypto.ts" "aes-256-gcm" "Session payloads use AES-256-GCM encryption"
require_text "services/sso-frontend/src/server/cookies.ts" "HttpOnly" "Session cookies are HttpOnly"
require_text "services/sso-frontend/src/server/cookies.ts" "Secure" "Session cookies are Secure"
require_text "services/sso-frontend/src/server/cookies.ts" "SameSite" "Session cookies define SameSite policy"
require_text "services/sso-frontend/src/server/cookies.ts" "__Secure-admin-session" "Session cookie keeps secure prefix"
require_text "services/sso-frontend/src/web/router/index.ts" "meta: \\{ requiresAuth: true \\}" "Vue routes are protected by auth metadata"
require_text "services/sso-frontend/src/web/stores/admin.ts" "/api/session" "Vue client checks same-origin session endpoint"
reject_text "services/sso-frontend/src/web/stores/admin.ts" "localStorage\\.setItem|sessionStorage\\.setItem|document\\.cookie[[:space:]]*=" "Vue client does not persist tokens in browser storage"

require_text "services/sso-frontend/Dockerfile" "FROM node:22-alpine AS deps" "Dockerfile uses Node 22 runtime base"
require_text "services/sso-frontend/Dockerfile" "npm ci --ignore-scripts" "Dockerfile installs from lockfile"
require_text "services/sso-frontend/Dockerfile" "npm run build" "Dockerfile performs production build"
require_text "services/sso-frontend/Dockerfile" "USER sso" "Runtime container drops root user"
require_text "services/sso-frontend/Dockerfile" 'CMD \["node", "dist/server/server/index\.js"\]' "Runtime command starts compiled BFF"

require_text "docker-compose.dev.yml" 'image: sso-dev-sso-frontend:\$\{APP_IMAGE_TAG:-local\}' "Primary frontend image is tag-addressable"
require_text "docker-compose.dev.yml" 'VITE_SSO_BASE_URL: \$\{SSO_BASE_URL\}' "Compose passes Vue SSO base URL"
require_text "docker-compose.dev.yml" 'VITE_ADMIN_BASE_URL: \$\{ADMIN_PANEL_BASE_URL\}' "Compose passes Vue admin base URL"
require_text "docker-compose.dev.yml" 'VITE_CLIENT_ID: \$\{ADMIN_PANEL_CLIENT_ID\}' "Compose passes Vue admin client ID"
require_text "docker-compose.dev.yml" 'http://127\.0\.0\.1:3000/healthz' "Compose healthcheck targets BFF health endpoint"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-backend.priority=200' "Backend API/OIDC router keeps highest priority"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-frontend.priority=50' "Primary frontend catch-all stays below backend priority"

require_text ".github/workflows/ci.yml" '\{ name: sso-frontend, path: services/sso-frontend \}' "CI runs frontend QA for primary SSO frontend"
require_text ".github/workflows/ci.yml" 'dockerfile: \./services/sso-frontend/Dockerfile' "CI builds primary SSO frontend image"
require_text ".github/workflows/ci.yml" 'VITE_SSO_BASE_URL=' "CI image build passes Vue SSO base URL"
require_text ".github/workflows/ci.yml" 'VITE_ADMIN_BASE_URL=' "CI image build passes Vue admin base URL"
require_text ".github/workflows/ci.yml" 'VITE_CLIENT_ID=' "CI image build passes Vue client ID"

require_text "scripts/vps-direct-build-deploy.sh" 'VITE_SSO_BASE_URL' "Direct deploy passes Vue SSO base URL"
require_text "scripts/vps-direct-build-deploy.sh" 'VITE_ADMIN_BASE_URL' "Direct deploy passes Vue admin base URL"
require_text "scripts/vps-direct-build-deploy.sh" 'VITE_CLIENT_ID' "Direct deploy passes Vue client ID"
require_text "scripts/vps-direct-build-deploy.sh" 'ROLLBACK_TAG="rollback-\$\{TAG\}"' "Direct deploy creates rollback image tag"
require_text "scripts/vps-direct-build-deploy.sh" 'wait_healthy "\$svc" 180' "Direct deploy health-gates runtime update"
require_text "scripts/vps-direct-build-deploy.sh" '--resolve "\$host:443:127\.0\.0\.1"' "Direct deploy smokes HTTPS through local reverse proxy"

printf '[sso-frontend-vue-lifecycle] Completed with %d failure(s)\n' "$FAILURES"

if (( FAILURES > 0 )); then
  exit 1
fi
