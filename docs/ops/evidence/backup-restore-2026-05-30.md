# Backup / Restore Drill Evidence Pack

> FR-056 / UC-78 — Database and state restore drill evidence.
> Operator signoff setelah eksekusi drill restore-control-plane terbaru.

## Drill Information

| Field | Value |
|---|---|
| Drill ID | `backup-restore-drill-001` |
| Execution timestamp (UTC) | 2026-05-30T06:03:03Z |
| Trigger | `backup-restore-drill.yml` (scheduled + workflow_dispatch) |
| Runner | self-hosted |
| Operator | Leavend |

## Artifacts

| Artifact | Path |
|---|---|
| Workflow definition | `.github/workflows/backup-restore-drill.yml` |
| Runbook | `docs/runbooks/backup-restore-drill-runbook.md` |
| Evidence pack template | `docs/runbooks/backup-drill-evidence-pack.md` |
| Reconciliation report | `docs/runbooks/backup-reconciliation-report.md` |
| Restore script | `infra/backup/run-restore-drill.sh` |
| Backup script | `infra/backup/create-control-plane-backup.sh` |
| Asset validation | `infra/sre/check-backup-drill-assets.sh` |

## CI Artifact Contents

Drill workflow uploads the following from `.artifacts/backup-drills/**/`:

- `manifest.env` — Drill ID, Backup ID, backup timestamp
- `source-snapshot.env` — Pre-restore database and Redis snapshot metrics
- `target-snapshot.env` — Post-restore snapshot metrics
- `comparison.env` — Snapshot diff with `RECON_STATUS` and `RECON_MISMATCH_TOTAL`
- `evidence.md` — Full evidence pack (auto-generated)
- `reconciliation-report.md` — Bootstrap archive match, mismatch total, pass/fail

## Acceptance Checklist

- [x] `infra/sre/check-backup-drill-assets.sh` passes (asset integrity check)
- [x] `run-restore-drill.sh` executes against latest backup directory
- [x] Postgres restore: all 3 databases restored (zitadel, sso-backend, app-b)
- [x] Redis restore: RDB dump loaded into fresh container
- [x] Snapshot comparison runs between source and target
- [x] Bootstrap archive content SHA256 match verified
- [x] Evidence pack written to `reconciliation-report.md`

## Operator Signoff

- **Operator:** Leavend
- **Role:** SRE / DevOps
- **Signed at:** 2026-05-30T07:00:00Z
- **Status:** PASS (`RECON_STATUS=success`, `RECON_MISMATCH_TOTAL=0`)
