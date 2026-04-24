#!/usr/bin/env python3
from __future__ import annotations

import os
import shlex
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Iterable


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def run_command(command: list[str], extra_env: dict[str, str] | None = None) -> str:
    try:
        process = subprocess.run(
            command,
            check=False,
            text=True,
            capture_output=True,
            env={**os.environ, **(extra_env or {})},
        )
    except OSError as exception:
        raise RuntimeError(str(exception)) from exception

    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or process.stdout.strip() or "command failed")

    return process.stdout.strip()


def redis_base_command(url: str, host: str, password: str, db: str) -> list[str]:
    command = ["redis-cli", "--raw"]

    if url:
        return command + ["-u", url]

    command += ["-h", host]

    if password:
        command += ["-a", password]

    return command + ["-n", db]


def redis_get(url: str, host: str, password: str, db: str, key: str) -> int:
    try:
        value = run_command(redis_base_command(url, host, password, db) + ["GET", key])
    except RuntimeError:
        return 0

    return int(value) if value else 0


def redis_scan(url: str, host: str, password: str, db: str, pattern: str) -> list[str]:
    try:
        output = run_command(redis_base_command(url, host, password, db) + ["--scan", "--pattern", pattern])
    except RuntimeError:
        return []

    return [line for line in output.splitlines() if line]


def psql_command(sql: str) -> tuple[list[str], dict[str, str]]:
    database_url = env("SSO_BACKEND_DATABASE_URL")

    if database_url:
        return ["psql", database_url, "-At", "-F", ",", "-c", sql], {}

    command = ["psql", "-At", "-F", ",", "-c", sql]
    extra_env = {
        "PGHOST": env("PGHOST", "postgres"),
        "PGPORT": env("PGPORT", "5432"),
        "PGDATABASE": env("PGDATABASE", env("SSO_BACKEND_DB", "")),
        "PGUSER": env("PGUSER", env("POSTGRES_ADMIN_USER", "")),
        "PGPASSWORD": env("PGPASSWORD", env("POSTGRES_ADMIN_PASSWORD", "")),
    }

    return command, extra_env


def reconciliation_counts() -> list[tuple[str, int]]:
    sql = """
    SELECT 'users', COUNT(*) FROM users
    WHERE COALESCE(subject_id, '') = ''
       OR (subject_uuid IS NOT NULL AND subject_uuid <> subject_id)
    UNION ALL
    SELECT 'login_contexts', COUNT(*) FROM login_contexts
    WHERE COALESCE(subject_id, '') = ''
       OR (subject_uuid IS NOT NULL AND subject_uuid <> subject_id)
    UNION ALL
    SELECT 'refresh_token_rotations', COUNT(*) FROM refresh_token_rotations
    WHERE COALESCE(subject_id, '') = ''
       OR (subject_uuid IS NOT NULL AND subject_uuid <> subject_id)
    """
    command, extra_env = psql_command(sql)

    try:
        output = run_command(command, extra_env)
    except RuntimeError:
        return []

    counts: list[tuple[str, int]] = []

    for line in output.splitlines():
        table, value = line.split(",", 1)
        counts.append((table, int(value)))

    return counts


def metric_line(name: str, value: float | int, labels: dict[str, str] | None = None) -> str:
    label_text = ""

    if labels:
        rendered = ",".join(f'{key}="{escape(value)}"' for key, value in sorted(labels.items()))
        label_text = "{" + rendered + "}"

    return f"{name}{label_text} {value}"


def escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def broker_metrics() -> list[str]:
    url = env("BROKER_REDIS_URL")
    host = env("BROKER_REDIS_HOST", env("REDIS_HOST", "redis"))
    password = env("BROKER_REDIS_PASSWORD", env("REDIS_PASSWORD", ""))
    db = env("BROKER_REDIS_DB", env("REDIS_CACHE_DB", "3"))

    hits = redis_get(url, host, password, db, "metrics:jwks_cache_hit_total")
    misses = redis_get(url, host, password, db, "metrics:jwks_cache_miss_total")
    total = hits + misses
    ratio = 0 if total == 0 else hits / total

    lines = [
        metric_line("sso_jwks_cache_hit_total", hits, {"component": "broker"}),
        metric_line("sso_jwks_cache_miss_total", misses, {"component": "broker"}),
        metric_line(
            "sso_jwks_refresh_fail_total",
            redis_get(url, host, password, db, "metrics:jwks_refresh_fail_total"),
            {"component": "broker"},
        ),
        metric_line(
            "sso_jwks_refresh_success_total",
            redis_get(url, host, password, db, "metrics:jwks_refresh_success_total"),
            {"component": "broker"},
        ),
        metric_line("sso_jwks_cache_hit_ratio", ratio, {"component": "broker"}),
        metric_line(
            "sso_logout_success_total",
            redis_get(url, host, password, db, "metrics:logout_success_total"),
            {"component": "broker"},
        ),
        metric_line(
            "sso_logout_failure_total",
            redis_get(url, host, password, db, "metrics:logout_failure_total"),
            {"component": "broker"},
        ),
    ]

    for key in redis_scan(url, host, password, db, "metrics:jwt_reject_total:*"):
        reason = key.rsplit(":", 1)[-1]
        lines.append(metric_line("sso_jwt_reject_total", redis_get(url, host, password, db, key), {"component": "broker", "reason": reason}))

    for key in redis_scan(url, host, password, db, "metrics:pkce_reject_total:*"):
        reason = key.rsplit(":", 1)[-1]
        lines.append(metric_line("sso_pkce_reject_total", redis_get(url, host, password, db, key), {"component": "broker", "reason": reason}))

    for key in redis_scan(url, host, password, db, "metrics:logout_failure_total:*"):
        reason = key.rsplit(":", 1)[-1]
        lines.append(metric_line("sso_logout_failure_total", redis_get(url, host, password, db, key), {"component": "broker", "reason": reason}))

    return lines


def app_b_metrics() -> list[str]:
    url = env("APP_B_REDIS_URL")
    host = env("APP_B_REDIS_HOST", env("REDIS_HOST", "redis"))
    password = env("APP_B_REDIS_PASSWORD", env("REDIS_PASSWORD", ""))
    db = env("APP_B_REDIS_DB", "5")

    hits = redis_get(url, host, password, db, "app-b:metrics:jwks_cache_hit_total")
    misses = redis_get(url, host, password, db, "app-b:metrics:jwks_cache_miss_total")
    total = hits + misses
    ratio = 0 if total == 0 else hits / total

    lines = [
        metric_line("sso_jwks_cache_hit_total", hits, {"component": "app-b"}),
        metric_line("sso_jwks_cache_miss_total", misses, {"component": "app-b"}),
        metric_line(
            "sso_jwks_refresh_fail_total",
            redis_get(url, host, password, db, "app-b:metrics:jwks_refresh_fail_total"),
            {"component": "app-b"},
        ),
        metric_line(
            "sso_jwks_refresh_success_total",
            redis_get(url, host, password, db, "app-b:metrics:jwks_refresh_success_total"),
            {"component": "app-b"},
        ),
        metric_line("sso_jwks_cache_hit_ratio", ratio, {"component": "app-b"}),
        metric_line(
            "sso_logout_replay_alert_total",
            redis_get(url, host, password, db, "app-b:metrics:logout_replay_alert_total"),
            {"component": "app-b"},
        ),
    ]

    for key in redis_scan(url, host, password, db, "app-b:metrics:jwt_reject_total:*"):
        reason = key.rsplit(":", 1)[-1]
        lines.append(metric_line("sso_jwt_reject_total", redis_get(url, host, password, db, key), {"component": "app-b", "reason": reason}))

    return lines


def app_a_metrics() -> list[str]:
    url = env("APP_A_REDIS_URL")

    if not url:
        return [metric_line("sso_logout_replay_alert_total", 0, {"component": "app-a"})]

    value = redis_get(url, "", "", "", "app-a:metrics:logout_replay_alert_total")
    return [metric_line("sso_logout_replay_alert_total", value, {"component": "app-a"})]


def admin_frontend_metrics() -> list[str]:
    url = env("SSO_FRONTEND_REDIS_URL")
    host = env("SSO_FRONTEND_REDIS_HOST", env("REDIS_HOST", "redis"))
    password = env("SSO_FRONTEND_REDIS_PASSWORD", env("REDIS_PASSWORD", ""))
    db = env("SSO_FRONTEND_REDIS_DB", "6")
    metrics = {
        "admin_login_page_view": "sso_admin_login_page_view_total",
        "admin_login_started": "sso_admin_login_started_total",
        "admin_login_success": "sso_admin_login_success_total",
        "admin_invalid_credentials": "sso_admin_invalid_credentials_total",
        "admin_forbidden": "sso_admin_forbidden_total",
        "admin_reauth_required": "sso_admin_reauth_required_total",
    }

    return [
        metric_line(metric, redis_get(url, host, password, db, f"sso-frontend:metrics:admin_auth_funnel_total:{event}"))
        for event, metric in metrics.items()
    ]


def reconciliation_metrics() -> list[str]:
    counts = reconciliation_counts()

    if not counts:
        return [metric_line("sso_identity_reconciliation_status", 0, {"scope": "canonical_identity"})]

    total = sum(value for _, value in counts)
    lines = [metric_line("sso_identity_reconciliation_mismatch_total", total)]

    for table, value in counts:
        lines.append(metric_line("sso_identity_reconciliation_mismatch_total", value, {"table": table}))

    status = 1 if total == 0 else 0
    lines.append(metric_line("sso_identity_reconciliation_status", status, {"scope": "canonical_identity"}))

    return lines


def read_status_file() -> dict[str, str]:
    status_file = env("SSO_BACKUP_STATUS_FILE")

    if not status_file:
        return {}

    try:
        lines = Path(status_file).read_text().splitlines()
    except OSError:
        return {}

    values: dict[str, str] = {}

    for line in lines:
        stripped = line.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        values[key] = value

    return values


def status_gauge(value: str) -> int:
    if value == "success":
        return 1

    if value == "failure":
        return 0

    return -1


def int_status_value(values: dict[str, str], key: str) -> int:
    try:
        return int(values.get(key, "0"))
    except ValueError:
        return 0


def backup_status_metrics() -> list[str]:
    values = read_status_file()

    return [
        metric_line(
            "sso_backup_status",
            status_gauge(values.get("BACKUP_STATUS", "unknown")),
            {"scope": "control_plane"},
        ),
        metric_line(
            "sso_backup_last_success_timestamp_seconds",
            int_status_value(values, "BACKUP_LAST_SUCCESS_EPOCH"),
            {"scope": "control_plane"},
        ),
        metric_line(
            "sso_backup_last_failure_timestamp_seconds",
            int_status_value(values, "BACKUP_LAST_FAILURE_EPOCH"),
            {"scope": "control_plane"},
        ),
        metric_line(
            "sso_backup_failure_total",
            int_status_value(values, "BACKUP_FAILURE_TOTAL"),
            {"scope": "control_plane"},
        ),
        metric_line(
            "sso_restore_drill_status",
            status_gauge(values.get("RESTORE_DRILL_STATUS", "unknown")),
            {"scope": "staging"},
        ),
        metric_line(
            "sso_restore_drill_last_success_timestamp_seconds",
            int_status_value(values, "RESTORE_DRILL_LAST_SUCCESS_EPOCH"),
            {"scope": "staging"},
        ),
        metric_line(
            "sso_restore_drill_last_failure_timestamp_seconds",
            int_status_value(values, "RESTORE_DRILL_LAST_FAILURE_EPOCH"),
            {"scope": "staging"},
        ),
        metric_line(
            "sso_restore_drill_failure_total",
            int_status_value(values, "RESTORE_DRILL_FAILURE_TOTAL"),
            {"scope": "staging"},
        ),
        metric_line(
            "sso_restore_drill_mismatch_total",
            int_status_value(values, "RESTORE_DRILL_MISMATCH_TOTAL"),
            {"scope": "staging"},
        ),
    ]


def render_metrics() -> str:
    lines = [
        "# HELP sso_metrics_exporter_up Indicates whether the exporter rendered a metrics payload.",
        "# TYPE sso_metrics_exporter_up gauge",
        "sso_metrics_exporter_up 1",
    ]

    lines.extend(broker_metrics())
    lines.extend(app_b_metrics())
    lines.extend(app_a_metrics())
    lines.extend(admin_frontend_metrics())
    lines.extend(reconciliation_metrics())
    lines.extend(backup_status_metrics())

    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self.respond(200, b"ok\n", "text/plain; charset=utf-8")
            return

        if self.path == "/metrics":
            body = render_metrics().encode("utf-8")
            self.respond(200, body, "text/plain; version=0.0.4; charset=utf-8")
            return

        self.respond(404, b"not found\n", "text/plain; charset=utf-8")

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003
        return

    def respond(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    address = env("EXPORTER_BIND", "0.0.0.0")
    port = int(env("EXPORTER_PORT", "9108"))
    server = HTTPServer((address, port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
