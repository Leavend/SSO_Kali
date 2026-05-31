# Admin SSO Cookie Session Strategy

Date: 2026-06-01

## Context

The standalone admin SPA is served from `admin-sso.timeh.my.id` and proxies API calls to `api-sso.timeh.my.id` through nginx. Browser cookies are scoped to the origin that receives the response, so the admin proxy must preserve backend cookies without weakening the backend cookie policy.

## Verification

The backend SSO session cookie policy intentionally requires:

- `__Host-` prefix
- `Secure`
- `Path=/`
- no `Domain` attribute

This is enforced in `SsoSessionCookiePolicy` and `SsoSessionCookieFactory`. A shared `Domain=.timeh.my.id` cookie would violate the `__Host-` contract and reopen cookie tossing risk.

## Decision

Keep host-only `__Host-*` cookies and use the standalone admin nginx proxy as the same-origin boundary:

- forward inbound `Cookie` headers to the backend;
- pass backend `Set-Cookie` headers back to the browser;
- do not rewrite cookie domains;
- do not introduce `Domain=.timeh.my.id` cookies.

If the admin domain later needs deeper auth-session consolidation, prefer the ISS-D6 BFF architecture evaluation over weakening cookie attributes.
