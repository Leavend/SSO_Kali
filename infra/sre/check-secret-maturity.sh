#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0

pass() {
  printf '[check-secret-maturity][PASS] %s\n' "$*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[check-secret-maturity][FAIL] %s\n' "$*" >&2
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

require_absent_text() {
  local file="$1" pattern="$2" label="$3"

  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    fail "$label"
  else
    pass "$label"
  fi
}

require_file "docs/security/secret-storage-policy.md"
require_file "docs/runbooks/dev-admin-password-rotation.md"
require_file "scripts/set-app-b-hash.sh"
require_file "scripts/lib/app-b-secret-guard.sh"
require_file ".env.dev.example"
require_file ".gitignore"
require_file ".dockerignore"
require_file "docker-compose.dev.yml"

require_text "docs/security/secret-storage-policy.md" '## Secret classification' "Secret policy classifies secrets by sensitivity and owner"
require_text "docs/security/secret-storage-policy.md" '## Runtime locations' "Secret policy defines runtime locations"
require_text "docs/security/secret-storage-policy.md" '## Rotation and provenance' "Secret policy defines rotation and provenance requirements"
require_text "docs/security/secret-storage-policy.md" 'GitHub Actions secrets' "Secret policy covers GitHub Actions secrets"
require_text "docs/security/secret-storage-policy.md" 'VPS runtime env' "Secret policy covers VPS runtime env"
require_text "docs/security/secret-storage-policy.md" 'Local development env|local development env' "Secret policy covers local development env"
require_text "docs/runbooks/dev-admin-password-rotation.md" 'Provenance' "Password rotation runbook records provenance"
require_text "scripts/set-app-b-hash.sh" 'APP_B_CLIENT_SECRET_HASH stored as quoted Argon2id literal' "App B hash rotation stores a Compose-safe hash"
require_text "scripts/lib/app-b-secret-guard.sh" 'APP_B_CLIENT_SECRET_HASH must verify APP_B_CLIENT_SECRET' "Deploy guard verifies App B secret/hash pairing"
require_text ".gitignore" '^\.env$|^\.env\.' "Git ignores local env files"
require_text ".gitignore" '^\.secrets/' "Git ignores local secret directory"
require_text ".dockerignore" '\.secrets' "Docker context excludes local secret directory"
require_text "docker-compose.dev.yml" 'APP_B_CLIENT_SECRET_HASH: \$\{APP_B_CLIENT_SECRET_HASH\}' "Broker uses verifier-side App B secret hash"
require_text "docker-compose.dev.yml" 'SSO_CLIENT_SECRET: \$\{APP_B_CLIENT_SECRET\}' "App B owns plaintext client secret at runtime"
if python3 - <<'PY' "$ROOT_DIR/.env.dev.example"
from __future__ import annotations

import re
import sys
from pathlib import Path

allowed_markers = (
    "changeme",
    "change-me",
    "example",
    "placeholder",
    "your_",
    "replace_",
    "after_zitadel_bootstrap",
    "base64:replace_",
    "dev",
    "sso-dev",
    "/",
    "http://",
    "https://",
    "redis://",
    "postgres",
    "$argon2id$",
)

secret_name = re.compile(r"(SECRET|PASSWORD|TOKEN|KEY|PRIVATE)")
quoted_placeholder = re.compile(r"^['\"]?\$\{[^}]+\}['\"]?$")
violations: list[str] = []

for number, raw_line in enumerate(Path(sys.argv[1]).read_text().splitlines(), start=1):
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue

    key, value = line.split("=", 1)
    value = value.strip().strip('"').strip("'")

    if key.endswith(("_PATH", "_EXPIRATIONDATE")):
        continue

    if not secret_name.search(key) or not value or quoted_placeholder.match(value):
        continue

    lowered = value.lower()
    if any(marker in lowered for marker in allowed_markers):
        continue

    if len(value) >= 20:
        violations.append(f"line {number}: {key}")

if violations:
    print("\n".join(violations))
    raise SystemExit(1)
PY
then
  pass "Env example does not include long literal secret values"
else
  fail "Env example does not include long literal secret values"
fi

printf '[check-secret-maturity] Completed with %d failure(s)\n' "$FAILURES"

if (( FAILURES > 0 )); then
  exit 1
fi
