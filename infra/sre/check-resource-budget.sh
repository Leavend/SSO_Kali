#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

python3 - <<'PY' "$COMPOSE_FILE"
from __future__ import annotations

import sys
from pathlib import Path

import yaml

compose_path = Path(sys.argv[1])
document = yaml.safe_load(compose_path.read_text())

required = {
    "proxy",
    "postgres",
    "redis",
    "zitadel-api",
    "zitadel-login",
    "sso-backend",
}

services = document.get("services", {})
missing = sorted(required - services.keys())

if missing:
    print(f"[check-resource-budget][ERROR] missing required services: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

def fail(message: str) -> None:
    print(f"[check-resource-budget][ERROR] {message}", file=sys.stderr)
    raise SystemExit(1)

for service in sorted(required):
    config = services[service]
    for key in ("cpus", "mem_limit", "mem_reservation", "memswap_limit", "deploy"):
        if key not in config:
            fail(f"{service} missing {key}")

    deploy = config["deploy"]
    resources = deploy.get("resources", {})
    limits = resources.get("limits", {})
    reservations = resources.get("reservations", {})

    if limits.get("cpus") != config["cpus"]:
        fail(f"{service} limits.cpus must match cpus")

    if str(limits.get("memory", "")).lower() != str(config["mem_limit"]).lower():
        fail(f"{service} limits.memory must match mem_limit")

    if str(config["memswap_limit"]).lower() != str(config["mem_limit"]).lower():
        fail(f"{service} memswap_limit must equal mem_limit to disable swap")

    if "memory" not in reservations:
        fail(f"{service} reservations.memory is required")

print("[check-resource-budget] OK")
PY
