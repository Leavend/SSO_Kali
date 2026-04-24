#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class MetricPolicy:
    key: str
    query: str
    minimum: float | None = None
    maximum: float | None = None


def main(argv: list[str]) -> int:
    output_dir = resolve_output_dir(argv)
    ensure_directory(output_dir)
    metrics, source = load_metrics()
    evaluations = evaluate(metrics)
    write_outputs(output_dir, metrics, evaluations, source)
    print_summary(evaluations, output_dir, source)
    return 0 if all(item["ok"] for item in evaluations) else 1


def resolve_output_dir(argv: list[str]) -> Path:
    if len(argv) > 1 and argv[1]:
        return Path(argv[1]).resolve()

    return Path.cwd() / "test-results" / "kpi-verification-gate"


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_metrics() -> tuple[dict[str, float], str]:
    fixture = os.getenv("KPI_SNAPSHOT_FIXTURE", "").strip()

    if fixture:
        return load_fixture(Path(fixture)), "fixture"

    base_url = os.getenv("PROMETHEUS_BASE_URL", "").strip()

    if not base_url:
        raise SystemExit("PROMETHEUS_BASE_URL or KPI_SNAPSHOT_FIXTURE must be set.")

    return query_prometheus(base_url), "prometheus"


def load_fixture(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text())
    metrics = payload.get("metrics")

    if not isinstance(metrics, dict):
        raise SystemExit("Fixture must contain a metrics object.")

    return {str(key): float(value) for key, value in metrics.items()}


def query_prometheus(base_url: str) -> dict[str, float]:
    return {policy.key: query_value(base_url, policy.query) for policy in policies()}


def query_value(base_url: str, query: str) -> float:
    url = f"{base_url.rstrip('/')}/api/v1/query?{urlencode({'query': query})}"
    request = Request(url, headers=request_headers())

    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    return extract_value(payload, query)


def request_headers() -> dict[str, str]:
    token = os.getenv("PROMETHEUS_BEARER_TOKEN", "").strip()

    if not token:
        return {}

    return {"Authorization": f"Bearer {token}"}


def extract_value(payload: dict[str, Any], query: str) -> float:
    if payload.get("status") != "success":
        raise SystemExit(f"Prometheus query failed for {query}.")

    data = payload.get("data", {})
    result = data.get("result", [])

    if not isinstance(result, list) or len(result) != 1:
        raise SystemExit(f"Prometheus query returned {len(result) if isinstance(result, list) else 'invalid'} series for {query}.")

    value = result[0].get("value", [None, None])

    if not isinstance(value, list) or len(value) != 2:
        raise SystemExit(f"Prometheus query returned an invalid value payload for {query}.")

    return float(value[1])


def policies() -> list[MetricPolicy]:
    return [
        MetricPolicy("proxy_uptime_ratio", "sso_proxy_uptime_ratio", minimum=0.99),
        MetricPolicy("token_validation_p95_seconds", "sso_token_validation_p95_seconds", maximum=0.75),
        MetricPolicy("broker_jwks_cache_hit_ratio", 'sso_jwks_cache_hit_ratio{component="broker"}', minimum=0.90),
        MetricPolicy("logout_success_ratio", "sso_logout_success_ratio", minimum=0.99),
        MetricPolicy("identity_reconciliation_status", 'sso_identity_reconciliation_status{scope="canonical_identity"}', minimum=1.0),
        MetricPolicy("identity_reconciliation_mismatch_total", "sso_identity_reconciliation_mismatch_total", maximum=0.0),
    ]


def evaluate(metrics: dict[str, float]) -> list[dict[str, Any]]:
    return [evaluate_policy(policy, metrics) for policy in policies()]


def evaluate_policy(policy: MetricPolicy, metrics: dict[str, float]) -> dict[str, Any]:
    value = metrics[policy.key]
    minimum_ok = policy.minimum is None or value >= policy.minimum
    maximum_ok = policy.maximum is None or value <= policy.maximum

    return {
        "metric": policy.key,
        "query": policy.query,
        "value": value,
        "minimum": policy.minimum,
        "maximum": policy.maximum,
        "ok": minimum_ok and maximum_ok,
    }


def write_outputs(
    output_dir: Path,
    metrics: dict[str, float],
    evaluations: list[dict[str, Any]],
    source: str,
) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    report = {
        "generated_at": timestamp,
        "source": source,
        "metrics": metrics,
        "evaluations": evaluations,
        "passed": all(item["ok"] for item in evaluations),
    }

    (output_dir / "kpi-snapshot.json").write_text(
        json.dumps(report, indent=2, sort_keys=True),
    )
    (output_dir / "kpi-summary.md").write_text(render_summary(report))


def render_summary(report: dict[str, Any]) -> str:
    lines = [
        "# KPI Promotion Gate Summary",
        "",
        f"- Source: `{report['source']}`",
        f"- Generated at: `{report['generated_at']}`",
        f"- Passed: `{report['passed']}`",
        "",
        "| Metric | Value | Threshold | Status |",
        "|---|---:|---|---|",
    ]

    for item in report["evaluations"]:
        threshold = format_threshold(item["minimum"], item["maximum"])
        status = "PASS" if item["ok"] else "FAIL"
        lines.append(f"| `{item['metric']}` | `{item['value']}` | `{threshold}` | `{status}` |")

    return "\n".join(lines) + "\n"


def format_threshold(minimum: float | None, maximum: float | None) -> str:
    if minimum is not None and maximum is None:
        return f">= {minimum}"
    if maximum is not None and minimum is None:
        return f"<= {maximum}"
    if minimum is not None and maximum is not None:
        return f">= {minimum}, <= {maximum}"
    return "n/a"


def print_summary(evaluations: list[dict[str, Any]], output_dir: Path, source: str) -> None:
    print(f"[kpi-gate] source={source}")

    for item in evaluations:
        status = "OK" if item["ok"] else "FAIL"
        print(f"[{status}] {item['metric']}={item['value']}")

    print(f"[kpi-gate] evidence={output_dir}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
