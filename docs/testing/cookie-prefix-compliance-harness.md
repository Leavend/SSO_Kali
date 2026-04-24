# Cookie Prefix Compliance Harness

## Scope

This harness validates raw `Set-Cookie` headers for the `__Host-*` contract across the broker, App A, and the Admin Panel.

## Assertions

- cookie name starts with `__Host-`
- `Secure` is present
- `HttpOnly` is present
- `Path=/`
- `Domain` is absent
- `SameSite` is either `Lax` or `Strict`
- expiration probes must send `Max-Age=0` or a past `Expires`

## Covered surfaces

- Broker authorize redirect:
  - `__Host-broker_session`
- App A E2E probe:
  - `__Host-app-a-session`
- Admin Panel E2E probe:
  - `__Host-admin-session`
  - `__Host-admin-tx`

## Commands

```bash
node --test tools/qa/assert-host-cookie-header.test.mjs
```

```bash
bash infra/qa/run-cookie-prefix-compliance.sh
```

## Required environment

- `COOKIE_COMPLIANCE_BROKER_BASE_URL`
- `COOKIE_COMPLIANCE_APP_A_BASE_URL`
- `COOKIE_COMPLIANCE_ADMIN_BASE_URL`
- `COOKIE_COMPLIANCE_CLIENT_ID`
  - Optional. Defaults to `prototype-app-a`.
