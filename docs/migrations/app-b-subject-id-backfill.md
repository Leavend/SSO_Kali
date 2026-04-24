# App B Subject ID Backfill

## Objective

Transition App B user identity storage from legacy `external_subject` to canonical `subject_id`.

## Migration Flow

1. Add nullable `subject_id` string column if missing.
2. Copy every legacy `external_subject` value into `subject_id`.
3. Remove legacy `external_subject` column.

## Rollback Flow

1. Recreate nullable `external_subject` string column if missing.
2. Copy `subject_id` values back into `external_subject`.
3. Remove `subject_id`.

## Data Safety

- The migration is idempotent for partially migrated environments.
- Backfill preserves opaque numeric-string identifiers exactly as issued by ZITADEL.

