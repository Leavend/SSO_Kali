#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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


@dataclass(frozen=True)
class MetricPoint:
    timestamp: str
    value: float


def main(argv: list[str]) -> int:
    output_dir = resolve_output_dir(argv)
    ensure_directory(output_dir)
    series, source = load_series()
    evaluations = evaluate_window(series)
    write_outputs(output_dir, series, evaluations, source)
    print_summary(evaluations, output_dir, source)
    return 0 if all(item["ok"] for item in evaluations) else 1


def resolve_output_dir(argv: list[str]) -> Path:
    if len(argv) > 1 and argv[1]:
        return Path(argv[1]).resolve()

    return Path.cwd() / "test-results" / "kpi-canary-pass-window"


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_series() -> tuple[dict[str, list[MetricPoint]], str]:
    fixture = os.getenv("KPI_WINDOW_FIXTURE", "").strip()

    if fixture:
        return load_fixture(Path(fixture)), "fixture"

    base_url = os.getenv("PROMETHEUS_BASE_URL", "").strip()

    if not base_url:
        raise SystemExit("PROMETHEUS_BASE_URL or KPI_WINDOW_FIXTURE must be set.")

    return query_prometheus_range(base_url), "prometheus"


def load_fixture(path: Path) -> dict[str, list[MetricPoint]]:
    payload = json.loads(path.read_text())
    series = payload.get("series")

    if not isinstance(series, dict):
        raise SystemExit("Fixture must contain a series object.")

    return {str(key): parse_points(values) for key, values in series.items()}


def parse_points(values: Any) -> list[MetricPoint]:
    if not isinstance(values, list) or not values:
        raise SystemExit("Each metric fixture must contain a non-empty list.")

    points: list[MetricPoint] = []

    for item in values:
        if not isinstance(item, dict):
            raise SystemExit("Fixture points must be objects.")
        points.append(parse_point(item))

    return points


def parse_point(item: dict[str, Any]) -> MetricPoint:
    timestamp = str(item.get("timestamp", "")).strip()
    value = item.get("value")

    if not timestamp:
        raise SystemExit("Fixture point is missing timestamp.")
    if value is None:
        raise SystemExit("Fixture point is missing value.")

    return MetricPoint(timestamp=timestamp, value=float(value))


def query_prometheus_range(base_url: str) -> dict[str, list[MetricPoint]]:
    return {policy.key: query_range(base_url, policy.query) for policy in policies()}


def query_range(base_url: str, query: str) -> list[MetricPoint]:
    url = build_query_range_url(base_url, query)
    request = Request(url, headers=request_headers())

    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    return extract_range(payload, query)


def build_query_range_url(base_url: str, query: str) -> str:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=window_hours())
    params = {
        "query": query,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "step": step_seconds(),
    }
    return f"{base_url.rstrip('/')}/api/v1/query_range?{urlencode(params)}"


def window_hours() -> int:
    return int(os.getenv("CANARY_WINDOW_HOURS", "72").strip())


def step_seconds() -> int:
    return int(os.getenv("PROMETHEUS_STEP_SECONDS", "300").strip())


def request_headers() -> dict[str, str]:
    token = os.getenv("PROMETHEUS_BEARER_TOKEN", "").strip()

    if not token:
        return {}

    return {"Authorization": f"Bearer {token}"}


def extract_range(payload: dict[str, Any], query: str) -> list[MetricPoint]:
    result = extract_result(payload, query)
    matrix = result.get("values", [])

    if not isinstance(matrix, list) or not matrix:
        raise SystemExit(f"Prometheus query returned no samples for {query}.")

    return [parse_matrix_point(item, query) for item in matrix]


def extract_result(payload: dict[str, Any], query: str) -> dict[str, Any]:
    if payload.get("status") != "success":
        raise SystemExit(f"Prometheus query failed for {query}.")

    result = payload.get("data", {}).get("result", [])

    if not isinstance(result, list) or len(result) != 1:
        size = len(result) if isinstance(result, list) else "invalid"
        raise SystemExit(f"Prometheus query returned {size} series for {query}.")

    return result[0]


def parse_matrix_point(item: Any, query: str) -> MetricPoint:
    if not isinstance(item, list) or len(item) != 2:
        raise SystemExit(f"Prometheus query returned invalid samples for {query}.")

    timestamp = datetime.fromtimestamp(float(item[0]), timezone.utc).isoformat()
    return MetricPoint(timestamp=timestamp, value=float(item[1]))


def policies() -> list[MetricPolicy]:
    return [
        MetricPolicy("proxy_uptime_ratio", "sso_proxy_uptime_ratio", minimum=0.99),
        MetricPolicy("token_validation_p95_seconds", "sso_token_validation_p95_seconds", maximum=0.75),
        MetricPolicy("broker_jwks_cache_hit_ratio", 'sso_jwks_cache_hit_ratio{component="broker"}', minimum=0.90),
        MetricPolicy("logout_success_ratio", "sso_logout_success_ratio", minimum=0.99),
        MetricPolicy("identity_reconciliation_status", 'sso_identity_reconciliation_status{scope="canonical_identity"}', minimum=1.0),
        MetricPolicy("identity_reconciliation_mismatch_total", "sso_identity_reconciliation_mismatch_total", maximum=0.0),
    ]


def evaluate_window(
    series: dict[str, list[MetricPoint]],
) -> list[dict[str, Any]]:
    return [evaluate_policy(policy, series[policy.key]) for policy in policies()]


def evaluate_policy(
    policy: MetricPolicy,
    points: list[MetricPoint],
) -> dict[str, Any]:
    breaches = [point for point in points if not point_ok(policy, point.value)]
    values = [point.value for point in points]

    return {
        "metric": policy.key,
        "query": policy.query,
        "samples": len(points),
        "minimum": policy.minimum,
        "maximum": policy.maximum,
        "observed_min": min(values),
        "observed_max": max(values),
        "breach_count": len(breaches),
        "first_breach": format_breach(breaches[:1]),
        "ok": len(breaches) == 0,
    }


def point_ok(policy: MetricPolicy, value: float) -> bool:
    minimum_ok = policy.minimum is None or value >= policy.minimum
    maximum_ok = policy.maximum is None or value <= policy.maximum
    return minimum_ok and maximum_ok


def format_breach(breaches: list[MetricPoint]) -> dict[str, Any] | None:
    if not breaches:
        return None

    first = breaches[0]
    return {"timestamp": first.timestamp, "value": first.value}


def write_outputs(
    output_dir: Path,
    series: dict[str, list[MetricPoint]],
    evaluations: list[dict[str, Any]],
    source: str,
) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    report = build_report(series, evaluations, source, timestamp)
    (output_dir / "kpi-canary-window.json").write_text(json.dumps(report, indent=2))
    (output_dir / "kpi-canary-window-summary.md").write_text(render_summary(report))


def build_report(
    series: dict[str, list[MetricPoint]],
    evaluations: list[dict[str, Any]],
    source: str,
    timestamp: str,
) -> dict[str, Any]:
    serialised = {key: [point.__dict__ for point in points] for key, points in series.items()}
    return {
        "generated_at": timestamp,
        "source": source,
        "window_hours": window_hours(),
        "step_seconds": step_seconds(),
        "series": serialised,
        "evaluations": evaluations,
        "passed": all(item["ok"] for item in evaluations),
    }


def render_summary(report: dict[str, Any]) -> str:
    lines = [
        "# KPI Canary Pass Window Summary",
        "",
        f"- Source: `{report['source']}`",
        f"- Window hours: `{report['window_hours']}`",
        f"- Step seconds: `{report['step_seconds']}`",
        f"- Generated at: `{report['generated_at']}`",
        f"- Passed: `{report['passed']}`",
        "",
        "| Metric | Samples | Observed range | Threshold | Breaches | Status |",
        "|---|---:|---|---|---:|---|",
    ]

    for item in report["evaluations"]:
        threshold = format_threshold(item["minimum"], item["maximum"])
        observed = f"{item['observed_min']}..{item['observed_max']}"
        status = "PASS" if item["ok"] else "FAIL"
        lines.append(
            f"| `{item['metric']}` | `{item['samples']}` | `{observed}` | `{threshold}` | `{item['breach_count']}` | `{status}` |"
        )

    return "\n".join(lines) + "\n"


def format_threshold(minimum: float | None, maximum: float | None) -> str:
    if minimum is not None and maximum is None:
        return f">= {minimum}"
    if maximum is not None and minimum is None:
        return f"<= {maximum}"
    if minimum is not None and maximum is not None:
        return f">= {minimum}, <= {maximum}"
    return "n/a"


def print_summary(
    evaluations: list[dict[str, Any]],
    output_dir: Path,
    source: str,
) -> None:
    print(f"[kpi-canary-window] source={source}")
    print(f"[kpi-canary-window] window_hours={window_hours()}")

    for item in evaluations:
        status = "OK" if item["ok"] else "FAIL"
        print(f"[{status}] {item['metric']} breaches={item['breach_count']}")

    print(f"[kpi-canary-window] evidence={output_dir}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
