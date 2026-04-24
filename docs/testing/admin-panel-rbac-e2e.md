# Admin Panel RBAC E2E

## Scope

The E2E baseline for RBAC UX lives in:
- `services/sso-frontend/e2e/admin-rbac.spec.ts`

## Coverage

- `/not_admin` renders a 403-style access denied state
- recovery actions are visible
- destructive controls are absent in the forbidden experience

## Local execution

```bash
cd services/sso-frontend
npm run test:e2e
```

## Staging extension

Once staging credentials and proxy routing are available, expand the suite to cover:
- successful callback for admin users
- callback redirect to `/not_admin` for non-admin users
- forbidden revoke attempts remaining hidden in session-management views
