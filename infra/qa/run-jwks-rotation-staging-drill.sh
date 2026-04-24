#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/jwks-rotation-staging-drill}"
SUMMARY_FILE="$REPORT_DIR/summary.md"

mkdir -p "$REPORT_DIR"

bash "$ROOT_DIR/infra/qa/run-jwks-rotation-simulation.sh"

cat >"$SUMMARY_FILE" <<'EOF'
# JWKS Rotation Staging Drill Summary

- Gate: `infra/qa/run-jwks-rotation-simulation.sh`
- Scope: broker upstream verifier and App B broker verifier
- Required outcome:
  - `kid` miss triggers bounded refresh
  - rotated key is accepted after refresh
  - missing rotated key records refresh failure
- Evidence:
  - `mock-jwks-server.log`
  - `mock-jwks-state.json`
  - `sso-backend-jwks-rotation.txt`
  - `app-b-jwks-rotation.txt`
EOF

printf '[jwks-rotation-staging-drill] evidence=%s\n' "$REPORT_DIR"
