# Admin Session Management Audit Events

## Event families

- `[ADMIN_AUDIT_DENIED]`
- `[ADMIN_AUDIT_SUCCESS]`
- `[ADMIN_AUDIT_FAILED]`

## Persistent ledger

- Table: `admin_audit_events`
- Storage mode: append-only
- Integrity: `previous_hash` + `event_hash`

## Required fields

- `action`
- `method`
- `path`
- `ip`
- `admin_email`
- `admin_role`
- `admin_subject_id`
- `timestamp`

## Action values

- `admin_api`
- `session_management`
- `revoke_session`
- `revoke_all_user_sessions`

## Usage

These events are intended for operational audit trails, alert routing, and post-incident review of destructive session actions.
