#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/kpi-verification-gate}"
ASSET_LOG="$REPORT_DIR/observability-assets.txt"
UNIT_LOG="$REPORT_DIR/kpi-gate-unit-tests.txt"
GATE_LOG="$REPORT_DIR/kpi-gate-run.txt"

mkdir -p "$REPORT_DIR"

run_asset_checks() {
  bash "$ROOT_DIR/infra/sre/check-observability-assets.sh" | tee "$ASSET_LOG"
}

run_unit_tests() {
  python3 -m unittest "$ROOT_DIR/tools/qa/tests/test_verify_kpi_promotion_gate.py" | tee "$UNIT_LOG"
}

run_gate() {
  python3 "$ROOT_DIR/tools/qa/verify_kpi_promotion_gate.py" "$REPORT_DIR" | tee "$GATE_LOG"
}

run_asset_checks
run_unit_tests
run_gate
