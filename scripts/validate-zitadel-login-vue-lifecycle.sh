#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

pass() {
  printf '[zitadel-login-vue-lifecycle][PASS] %s\n' "$*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[zitadel-login-vue-lifecycle][FAIL] %s\n' "$*" >&2
}

require_file() {
  local path="$1"
  if [[ -f "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
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

require_file "services/zitadel-login-vue/package.json"
require_file "services/zitadel-login-vue/package-lock.json"
require_file "services/zitadel-login-vue/Dockerfile"
require_file "services/zitadel-login-vue/src/server/index.ts"
require_file "services/zitadel-login-vue/src/server/zitadel-client.ts"
require_file "services/zitadel-login-vue/src/server/api-handlers.ts"
require_file "services/zitadel-login-vue/src/web/views/LoginView.vue"
require_file "services/zitadel-login-vue/src/web/views/PasswordView.vue"
require_file "services/zitadel-login-vue/src/web/views/OtpView.vue"
require_file "services/zitadel-login-vue/src/web/styles/main.css"
require_file "services/zitadel-login-vue/scripts/smoke-built-server.mjs"
require_file "docs/generated/zitadel-vue-login-canary-runbook-2026-04-26.md"

python3 - <<'PY' "$ROOT_DIR/services/zitadel-login-vue/package.json" "$ROOT_DIR/services/zitadel-login-vue/package-lock.json"
from __future__ import annotations

import json
import sys
from pathlib import Path

pkg = json.loads(Path(sys.argv[1]).read_text())
lock = json.loads(Path(sys.argv[2]).read_text())
deps = pkg.get("dependencies", {}) | pkg.get("devDependencies", {})

expected = {
    "vue": ("^3.5.33", "3.5.33"),
    "vite": ("^8.0.10", "8.0.10"),
    "vue-router": ("^5.0.6", "5.0.6"),
    "pinia": ("^3.0.4", "3.0.4"),
    "@vitejs/plugin-vue": ("^6.0.6", "6.0.6"),
}

for name, (manifest, locked) in expected.items():
    if deps.get(name) != manifest:
        raise SystemExit(f"[zitadel-login-vue-lifecycle][FAIL] {name} manifest is not {manifest}")
    actual = lock.get("packages", {}).get(f"node_modules/{name}", {}).get("version")
    if actual != locked:
        raise SystemExit(f"[zitadel-login-vue-lifecycle][FAIL] {name} lock is {actual}, expected {locked}")

for name in ("next", "react", "react-dom"):
    if name in deps:
        raise SystemExit(f"[zitadel-login-vue-lifecycle][FAIL] forbidden hosted login patch dependency remains: {name}")

print("[zitadel-login-vue-lifecycle][PASS] Vue/Vite login stack is locked to expected latest versions")
print("[zitadel-login-vue-lifecycle][PASS] Next/React dependencies are absent from Vue login canary")
PY

require_text "services/zitadel-login-vue/src/server/zitadel-client.ts" '/v2/sessions' "Vue login uses ZITADEL Session API"
require_text "services/zitadel-login-vue/src/server/zitadel-client.ts" '/v2/oidc/auth_requests/' "Vue login finalizes OIDC auth requests"
require_text "services/zitadel-login-vue/src/server/cookies.ts" 'HttpOnly' "Vue login keeps session token in HttpOnly cookie"
require_text "services/zitadel-login-vue/src/server/cookies.ts" 'SameSite=Lax' "Vue login cookie has SameSite policy"
require_text "services/zitadel-login-vue/src/server/cookies.ts" 'createHmac' "Vue login session cookie is signed"
require_text "services/zitadel-login-vue/src/web/views/LoginView.vue" 'replaceState' "Vue login cleans flow query from the visible URL after hydration"
require_text "services/zitadel-login-vue/src/web/views/OtpView.vue" 'watch\(code' "Vue login auto-submits full authenticator codes"
require_text "services/zitadel-login-vue/src/shared/messages.ts" 'Kode autentikator' "Vue login validation messages are Indonesian"
reject_text "services/zitadel-login-vue/src/web/stores/loginFlow.ts" 'localStorage\.setItem|sessionStorage\.setItem|document\.cookie[[:space:]]*=' "Vue login does not persist credentials in browser storage"
reject_text "services/zitadel-login-vue/src/web/styles/main.css" 'letter-spacing:[[:space:]]*-' "Vue login typography avoids negative letter spacing"
reject_text "services/zitadel-login-vue/src/web/styles/main.css" 'font-size:[^;]*(clamp|vw|vh|vmin|vmax)' "Vue login typography avoids viewport-scaled font sizes"

require_text "docker-compose.dev.yml" 'zitadel-login-vue:' "Compose defines Vue login canary service"
require_text "docker-compose.dev.yml" 'ZITADEL_LOGIN_ACTIVE_BASE_PATH:-/ui/v2/login' "Compose keeps hosted login as rollback default"
require_text "docker-compose.dev.yml" 'PathPrefix\(`\$\{ZITADEL_LOGIN_VUE_BASE_PATH:-/ui/v2/login-vue\}`\)' "Vue login canary route is isolated"
require_text ".env.dev.example" '^ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login$' "Env defaults to hosted login for rollback safety"
require_text ".env.dev.example" '^ZITADEL_LOGIN_VUE_BASE_PATH=/ui/v2/login-vue$' "Env exposes Vue login canary path"
require_text ".github/workflows/ci.yml" 'zitadel-login-vue' "CI tests and builds Vue login canary"
require_text ".github/workflows/devops-lifecycle.yml" 'validate-zitadel-login-vue-lifecycle\.sh' "DevOps workflow gates Vue login lifecycle"
require_text "scripts/vps-direct-build-deploy.sh" 'Zitadel Vue Login Canary' "Direct deploy smokes Vue login canary"
require_text "scripts/vps-direct-build-deploy.sh" 'ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set' "Direct deploy preflights Vue login cookie secret"
require_text "scripts/vps-deploy.sh" 'zitadel-login-vue' "Registry deploy includes Vue login canary"
require_text "scripts/vps-deploy.sh" 'ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set' "Registry deploy preflights Vue login cookie secret"
require_text "scripts/vps-rollback.sh" 'zitadel-login-vue' "Rollback includes Vue login canary image swap"

printf '[zitadel-login-vue-lifecycle] Completed with %d failure(s)\n' "$FAILURES"

if (( FAILURES > 0 )); then
  exit 1
fi
