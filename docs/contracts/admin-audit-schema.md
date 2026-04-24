# Admin Audit Schema

## Table
- `admin_audit_events`

## Storage contract
- `event_id`: ULID string, unique
- `action`: logical action name
- `outcome`: `denied`, `succeeded`, or `failed`
- `admin_subject_id`: broker subject identifier for the acting admin
- `admin_email`: admin email at event time
- `admin_role`: admin role at event time
- `method`: HTTP method
- `path`: request path
- `ip_address`: request IP
- `reason`: primary deny/failure reason when present
- `context`: JSON payload with action-specific fields
- `occurred_at`: event time
- `previous_hash`: previous ledger hash for chaining
- `event_hash`: HMAC-SHA256 digest of the canonical record

## Immutability
- Events are append-only.
- Application code rejects updates and deletes through the model layer.
- `previous_hash` plus `event_hash` provide tamper-evident chaining.
