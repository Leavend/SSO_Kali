from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "tools" / "qa" / "verify_kpi_promotion_gate.py"
PASS_FIXTURE = ROOT / "tools" / "qa" / "fixtures" / "kpi-snapshot-pass.json"
FAIL_FIXTURE = ROOT / "tools" / "qa" / "fixtures" / "kpi-snapshot-fail.json"


class VerifyKpiPromotionGateTest(unittest.TestCase):
    def test_pass_fixture_succeeds_and_writes_evidence(self) -> None:
        result, report = run_gate(PASS_FIXTURE)

        self.assertEqual(result.returncode, 0)
        self.assertTrue(report["passed"])
        self.assertEqual(report["source"], "fixture")

    def test_fail_fixture_fails_fast(self) -> None:
        result, report = run_gate(FAIL_FIXTURE)

        self.assertEqual(result.returncode, 1)
        self.assertFalse(report["passed"])
        self.assertIn("[FAIL] logout_success_ratio=0.7", result.stdout)


def run_gate(fixture: Path) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory)
        env = {
            **os.environ,
            "KPI_SNAPSHOT_FIXTURE": str(fixture),
        }
        result = subprocess.run(
            ["python3", str(SCRIPT), str(output_dir)],
            check=False,
            text=True,
            capture_output=True,
            env=env,
        )
        report = json.loads((output_dir / "kpi-snapshot.json").read_text())

        return result, report


if __name__ == "__main__":
    unittest.main()
