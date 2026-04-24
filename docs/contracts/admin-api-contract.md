# Admin API Contract

## Protected routes
- `GET /admin/api/users`
- `GET /admin/api/users/{subjectId}`
- `GET /admin/api/sessions`
- `GET /admin/api/sessions/{sessionId}`
- `GET /admin/api/clients`
- `DELETE /admin/api/sessions/{sessionId}`
- `DELETE /admin/api/users/{subjectId}/sessions`

## Authorization
1. `AdminGuard` requires a valid broker access token.
2. The token subject must map to a local user with `role=admin`.
3. Destructive session-management routes also require membership in `ADMIN_PANEL_SESSION_MANAGEMENT_ROLES`.

## Failure contract
- Missing/invalid bearer token: `401`
- Non-admin token subject: `403`
- Admin without explicit destructive role: `403`

## Audit contract
- Every destructive allow/deny/failure writes an event to `admin_audit_events`.
- Audit rows are append-only and chained with `previous_hash` / `event_hash`.
