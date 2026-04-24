from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "tools" / "qa" / "verify_kpi_canary_window.py"
PASS_FIXTURE = ROOT / "tools" / "qa" / "fixtures" / "kpi-canary-window-pass.json"
FAIL_FIXTURE = ROOT / "tools" / "qa" / "fixtures" / "kpi-canary-window-fail.json"


class VerifyKpiCanaryWindowTest(unittest.TestCase):
    def test_pass_fixture_succeeds(self) -> None:
        result, report = run_gate(PASS_FIXTURE)

        self.assertEqual(result.returncode, 0)
        self.assertTrue(report["passed"])
        self.assertEqual(report["window_hours"], 72)

    def test_fail_fixture_detects_breach(self) -> None:
        result, report = run_gate(FAIL_FIXTURE)

        self.assertEqual(result.returncode, 1)
        self.assertFalse(report["passed"])
        self.assertIn("[FAIL] logout_success_ratio breaches=1", result.stdout)


def run_gate(fixture: Path) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory)
        env = {
            **os.environ,
            "KPI_WINDOW_FIXTURE": str(fixture),
            "CANARY_WINDOW_HOURS": "72",
        }
        result = subprocess.run(
            ["python3", str(SCRIPT), str(output_dir)],
            check=False,
            text=True,
            capture_output=True,
            env=env,
        )
        report = json.loads((output_dir / "kpi-canary-window.json").read_text())
        return result, report


if __name__ == "__main__":
    unittest.main()
