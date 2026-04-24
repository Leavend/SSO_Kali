# Admin Panel RBAC UX Spec

## Policy

- Only authenticated `admin` users may access the Admin Panel.
- Forbidden users must be redirected to `/not_admin`.
- Destructive actions such as `Revoke` and `Revoke All Sessions` must never render for unauthorized roles.

## Secure failure modes

- `401` and `403` responses from the Admin API are treated as authorization failures.
- Authorization failures emit frontend runtime telemetry with the marker `[ADMIN_RBAC_FORBIDDEN]`.
- The UI must recover to a safe state instead of leaving the user on a broken page.

## UX requirements

- `/not_admin` shows a clear access denied state.
- The page offers only safe recovery actions:
  - back to sign in
  - sign out safely
- No destructive controls are rendered in the forbidden state.
