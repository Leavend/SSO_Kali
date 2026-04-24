# Admin Audit Taxonomy

- Status: Draft
- Date: 2026-04-05
- Scope: `sso-backend` admin ledger

## Purpose

`admin_audit_events` keeps immutable audit records for admin access and destructive actions.
`taxonomy` adds a machine-readable policy class that stays distinct from `outcome`.

## Taxonomy Values

| Taxonomy | Meaning |
|---|---|
| `fresh_auth_success` | fresh admin bootstrap/read access succeeded |
| `stale_auth_rejected` | admin request was rejected because auth freshness was stale |
| `forbidden` | authenticated admin identity was denied by RBAC/policy boundary |
| `destructive_action_with_step_up` | destructive action ran under step-up freshness rules |

## Modeling Rule

- `outcome` answers whether the event succeeded, failed, or was denied
- `taxonomy` answers what security class the event belongs to

Example:

- `outcome=succeeded`, `taxonomy=fresh_auth_success`
- `outcome=denied`, `taxonomy=stale_auth_rejected`
- `outcome=denied`, `taxonomy=forbidden`
- `outcome=succeeded|failed`, `taxonomy=destructive_action_with_step_up`
