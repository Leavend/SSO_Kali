# Backup Reconciliation Report Template

## Scope

Compare source and restored snapshots for:

- Postgres table count digests per protected database
- Postgres total row counts per protected database
- Redis key counts and key digests per protected database index
- ZITADEL bootstrap content hash

## Pass Criteria

- Every `POSTGRES_*` key matches
- Every `REDIS_*` key matches
- `ZITADEL_BOOTSTRAP_CONTENT_SHA256` matches the restored extraction hash
- Total mismatches = `0`

## Output Contract

- `comparison.env` MUST contain:
  - `RECON_STATUS`
  - `RECON_MATCHED_KEYS_TOTAL`
  - `RECON_MISMATCH_TOTAL`
  - `RECON_MISMATCH_KEYS`

- `reconciliation-report.md` MUST summarize:
  - backup ID
  - drill ID
  - mismatch total
  - bootstrap archive match
