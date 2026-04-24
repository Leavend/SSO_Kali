# Cookie Policy Standard

## Scope

This standard applies to the Laravel SSO broker hosted in `/services/sso-backend`.

## Required session cookie profile

- The broker session cookie name must start with `__Host-`.
- The broker session cookie must include `Secure`.
- The broker session cookie must use `Path=/`.
- The broker session cookie must omit the `Domain` attribute.
- The broker session cookie should remain `HttpOnly`.
- The broker session cookie should remain `SameSite=Lax` unless a documented cross-site requirement changes that posture.

## Current as-built contract

- Canonical broker session cookie name: `__Host-broker_session`
- Cookie path: `/`
- Cookie domain: omitted
- Secure: enforced

## Enforcement layers

1. Configuration is validated during broker boot.
2. Outgoing `Set-Cookie` headers are asserted at runtime on the `web` middleware group.
3. CI feature tests parse the emitted session cookie from `/authorize` responses.

## Failure mode

The broker fails closed if a session cookie violates the policy. This prevents silent downgrade to a weaker cookie scope.
