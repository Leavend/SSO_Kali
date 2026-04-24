#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW_FILE="${ROOT_DIR}/.github/workflows/backup-restore-drill.yml"
RULES_FILE="${ROOT_DIR}/infra/observability/prometheus/rules/sso-kpis.yml"
EXPORTER_FILE="${ROOT_DIR}/infra/observability/exporters/sso_kpi_exporter.py"

bash -n "${ROOT_DIR}/infra/backup/backup-common.sh"
bash -n "${ROOT_DIR}/infra/backup/backup-status-lib.sh"
bash -n "${ROOT_DIR}/infra/backup/create-control-plane-backup.sh"
bash -n "${ROOT_DIR}/infra/backup/capture-reconciliation-snapshot.sh"
bash -n "${ROOT_DIR}/infra/backup/compare-reconciliation-snapshots.sh"
bash -n "${ROOT_DIR}/infra/backup/run-restore-drill.sh"

python3 - <<'PY' "$WORKFLOW_FILE" "$RULES_FILE" "$EXPORTER_FILE"
from __future__ import annotations

import py_compile
import sys
from pathlib import Path

import yaml

workflow_path, rules_path, exporter_path = [Path(arg) for arg in sys.argv[1:]]
workflow = yaml.safe_load(workflow_path.read_text())
rules = yaml.safe_load(rules_path.read_text())
py_compile.compile(str(exporter_path), doraise=True)

job = workflow["jobs"]["restore-drill"]
steps = "\n".join(step.get("run", "") for step in job["steps"] if isinstance(step, dict))
alerts = {
    rule["alert"]
    for group in rules["groups"]
    for rule in group["rules"]
    if "alert" in rule
}

required_alerts = {"SsoBackupFailureDetected", "SsoBackupStale", "SsoRestoreDrillFailed"}

if not required_alerts.issubset(alerts):
    missing = sorted(required_alerts - alerts)
    raise SystemExit(f"[check-backup-drill-assets][ERROR] missing alerts: {', '.join(missing)}")

if "run-restore-drill.sh" not in steps:
    raise SystemExit("[check-backup-drill-assets][ERROR] workflow does not execute restore drill")

print("[check-backup-drill-assets] OK")
PY

