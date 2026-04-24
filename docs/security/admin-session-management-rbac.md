# Admin Session Management RBAC

## Scope

This policy governs destructive session-management operations exposed by the broker Admin API.

## Protected actions

- `DELETE /admin/api/sessions/{sessionId}`
- `DELETE /admin/api/users/{subjectId}/sessions`

## Access model

1. `AdminGuard` requires a valid broker access token and a user record with `role=admin`.
2. `RequireAdminSessionManagementRole` then enforces the explicit role allowlist from `ADMIN_PANEL_SESSION_MANAGEMENT_ROLES`.

## Default role allowlist

- `admin`

## Failure behavior

- Missing or invalid bearer token: `401`
- Non-admin token subject: `403`
- Admin user outside the explicit destructive-role allowlist: `403`

## Audit requirement

Every destructive session-management attempt must produce a structured audit event in `admin_audit_events` on:
- deny
- success
- failure
