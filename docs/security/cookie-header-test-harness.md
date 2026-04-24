# Cookie Header Test Harness

## Goal

Verify that broker responses emit only a compliant `__Host-*` session cookie.

## CI checks

- Unit: validate the policy object rejects invalid names, domain usage, and non-secure cookies.
- Feature: issue a real `/authorize` request, parse `Set-Cookie`, and assert:
  - cookie name is `__Host-broker_session`
  - `Secure` is enabled
  - `Path=/`
  - `Domain` is omitted

## Runtime checks

- The broker logs `[BROKER_SESSION_COOKIE_POLICY_VIOLATION]` and aborts the response if a non-compliant session cookie is emitted.
