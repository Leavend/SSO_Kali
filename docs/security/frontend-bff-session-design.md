# Frontend BFF Session Design

## App A

- Authentication is completed through the broker callback.
- Tokens are verified server-side.
- Tokens are stored server-side in Redis.
- The browser receives only an opaque `__Host-app-a-session` cookie.

## Admin Panel

- Authentication is completed through the broker callback.
- Admin API access uses bearer tokens server-side after session recovery.
- The browser receives only opaque `__Host-admin-session` and short-lived `__Host-admin-tx` cookies.

## Security intent

- Token material never enters browser storage APIs.
- Cookie names and attributes align with host-only `__Host-*` policy.
- Session invalidation is performed server-side.
