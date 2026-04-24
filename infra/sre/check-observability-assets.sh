#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULES_FILE="${ROOT_DIR}/infra/observability/prometheus/rules/sso-kpis.yml"
FUNNEL_RULES_FILE="${ROOT_DIR}/infra/observability/prometheus/rules/admin-auth-funnel.yml"
PROM_FILE="${ROOT_DIR}/infra/observability/prometheus/prometheus.sso.yml"
DASHBOARD_FILE="${ROOT_DIR}/infra/observability/grafana/dashboards/sso-control-plane-dashboard.json"
FUNNEL_DASHBOARD_FILE="${ROOT_DIR}/infra/observability/grafana/dashboards/admin-auth-funnel-dashboard.json"
ALERTMANAGER_FILE="${ROOT_DIR}/infra/observability/alertmanager/alertmanager.sso.yml"
EXPORTER_FILE="${ROOT_DIR}/infra/observability/exporters/sso_kpi_exporter.py"

python3 - <<'PY' "$RULES_FILE" "$FUNNEL_RULES_FILE" "$PROM_FILE" "$DASHBOARD_FILE" "$FUNNEL_DASHBOARD_FILE" "$ALERTMANAGER_FILE" "$EXPORTER_FILE"
from __future__ import annotations

import json
import py_compile
import sys
from pathlib import Path

import yaml

(
    rules_path,
    funnel_rules_path,
    prom_path,
    dashboard_path,
    funnel_dashboard_path,
    alertmanager_path,
    exporter_path,
) = [Path(arg) for arg in sys.argv[1:]]

rules = yaml.safe_load(rules_path.read_text())
funnel_rules = yaml.safe_load(funnel_rules_path.read_text())
prom = yaml.safe_load(prom_path.read_text())
dashboard = json.loads(dashboard_path.read_text())
funnel_dashboard = json.loads(funnel_dashboard_path.read_text())
alertmanager = yaml.safe_load(alertmanager_path.read_text())
py_compile.compile(str(exporter_path), doraise=True)

alerts = {
    rule["alert"]
    for group in rules["groups"]
    for rule in group["rules"]
    if "alert" in rule
}
alerts |= {
    rule["alert"]
    for group in funnel_rules["groups"]
    for rule in group["rules"]
    if "alert" in rule
}

required_alerts = {
    "SsoProxyBlackboxDown",
    "SsoTokenValidationLatencyHigh",
    "SsoJwksCacheHitRatioLow",
    "SsoJwksRefreshFailures",
    "SsoLogoutSuccessRateLow",
    "SsoIdentityReconciliationMismatch",
    "SsoBackupFailureDetected",
    "SsoBackupStale",
    "SsoRestoreDrillFailed",
    "SsoAdminLoginSuccessRatioLow",
    "SsoAdminInvalidCredentialsSpike",
    "SsoAdminForbiddenSpike",
    "SsoAdminReauthRequiredSpike",
}

missing_alerts = sorted(required_alerts - alerts)

if missing_alerts:
    raise SystemExit(f"[check-observability-assets][ERROR] missing alerts: {', '.join(missing_alerts)}")

job_names = {job["job_name"] for job in prom["scrape_configs"]}
required_jobs = {"traefik", "sso-kpi-exporter", "sso-public-blackbox"}

if not required_jobs.issubset(job_names):
    missing = sorted(required_jobs - job_names)
    raise SystemExit(f"[check-observability-assets][ERROR] missing scrape jobs: {', '.join(missing)}")

rule_files = set(prom.get("rule_files", []))
required_rule_files = {
    "/etc/prometheus/rules/sso-kpis.yml",
    "/etc/prometheus/rules/admin-auth-funnel.yml",
}

if not required_rule_files.issubset(rule_files):
    missing = sorted(required_rule_files - rule_files)
    raise SystemExit(f"[check-observability-assets][ERROR] missing rule_files: {', '.join(missing)}")

panel_titles = {panel["title"] for panel in dashboard["panels"]}
required_panels = {
    "Proxy Uptime Ratio",
    "Token Validation p95",
    "Broker JWKS Cache Hit Ratio",
    "Logout Success Ratio",
    "Identity Reconciliation Mismatches",
}

if not required_panels.issubset(panel_titles):
    missing = sorted(required_panels - panel_titles)
    raise SystemExit(f"[check-observability-assets][ERROR] missing dashboard panels: {', '.join(missing)}")

funnel_panel_titles = {panel["title"] for panel in funnel_dashboard["panels"]}
required_funnel_panels = {
    "Admin Login Page Views",
    "Admin Login Started",
    "Admin Login Success",
    "Admin Invalid Credentials",
    "Admin Forbidden",
    "Admin Reauth Required",
    "Admin Login Success Ratio",
}

if not required_funnel_panels.issubset(funnel_panel_titles):
    missing = sorted(required_funnel_panels - funnel_panel_titles)
    raise SystemExit(f"[check-observability-assets][ERROR] missing funnel dashboard panels: {', '.join(missing)}")

receivers = {receiver["name"] for receiver in alertmanager["receivers"]}

if {"slack-sso", "pagerduty-sso"} - receivers:
    missing = sorted({"slack-sso", "pagerduty-sso"} - receivers)
    raise SystemExit(f"[check-observability-assets][ERROR] missing alertmanager receivers: {', '.join(missing)}")

print("[check-observability-assets] OK")
PY
