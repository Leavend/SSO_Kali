# Backup Restore Drill Runbook

## Objective

Prove that the SSO control plane can be backed up and restored in staging with zero reconciliation mismatches before production promotion.

## Protected Assets

- Postgres databases:
  - `zitadel`
  - `sso_backend`
  - `app_b`
- Redis dataset used by App A, broker, and App B
- `zitadel-bootstrap` volume contents

## Scripts

- `infra/backup/create-control-plane-backup.sh`
- `infra/backup/run-restore-drill.sh`
- `infra/backup/capture-reconciliation-snapshot.sh`
- `infra/backup/compare-reconciliation-snapshots.sh`

## Procedure

1. Run `create-control-plane-backup.sh`.
2. Verify `manifest.env` and `source-snapshot.env` exist.
3. Run `run-restore-drill.sh --backup-dir <backup-dir>`.
4. Confirm these outputs exist in `<backup-dir>/drill`:
   - `target-snapshot.env`
   - `comparison.env`
   - `reconciliation-report.md`
   - `evidence.md`
5. Confirm `RECON_STATUS=success` and `RECON_MISMATCH_TOTAL=0`.
6. Confirm bootstrap archive hash match is `true`.
7. Archive the evidence pack with the change record.

## Promotion Gate

Production promotion is blocked unless:

- latest backup status is `success`
- latest restore drill status is `success`
- reconciliation mismatch total is `0`
- bootstrap archive match is `true`

## Runtime Alert Expectations

- `SsoBackupFailureDetected`
- `SsoBackupStale`
- `SsoRestoreDrillFailed`

