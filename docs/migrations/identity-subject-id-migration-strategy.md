# Identity Subject ID Migration Strategy

## Objective

Move the platform from the legacy `subject_uuid` naming contract to the canonical `subject_id` string contract without breaking existing environments.

## Strategy

### Phase 1: Introduce Canonical Columns

- Add `subject_id` to:
  - `users`
  - `login_contexts`
  - `refresh_token_rotations`
- Use string columns only
- Add the required unique/index constraints for the new columns

### Phase 2: Backfill Existing Data

- Copy legacy values from `subject_uuid` into `subject_id`
- Backfill is row-based and database-agnostic
- No raw SQL is used

### Phase 3: Flip Runtime Reads

- All runtime reads switch to `subject_id`
- JWT `sub` maps directly to `subject_id`
- Admin APIs expose `subject_id`

### Phase 4: Dual-Write Compatibility

- Runtime writes `subject_id` and mirrors the same value into `subject_uuid`
- This keeps old rows and rollback windows safe during transition

### Phase 5: Future Cleanup

A later migration may remove `subject_uuid` after:

- all deployments are upgraded
- all reporting and admin tooling consume `subject_id`
- no compatibility reads remain

## Safety Properties

- Works on SQLite and PostgreSQL
- Avoids vendor-specific SQL
- Supports fresh installs and upgraded environments
- Preserves data continuity for all current subjects

## CI Gates

- Fresh schema must expose `subject_id` as a non-UUID string
- Backfill test must prove 100% legacy-to-canonical copy
- Static lint must fail if `subject_id` is declared as a UUID
- Runtime tests must accept opaque numeric-string subjects
