# Backup Drill Evidence Pack Template

## Required Fields

- Drill ID
- Backup ID
- Execution timestamp (UTC)
- Source backup directory
- Manifest checksum references
- Snapshot comparison status
- Reconciliation mismatch total
- Bootstrap archive match result
- Operator / automation identity

## Required Attachments

- `manifest.env`
- `source-snapshot.env`
- `target-snapshot.env`
- `comparison.env`
- `reconciliation-report.md`
- exported CI job log

## Acceptance Summary

- `RECON_STATUS=success`
- `RECON_MISMATCH_TOTAL=0`
- `BOOTSTRAP_ARCHIVE_MATCH=true`
- no backup or restore alerts firing at closeout

