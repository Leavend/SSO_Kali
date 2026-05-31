# Admin SSO Serving Architecture

Date: 2026-06-01

## Context

The admin UI can be served in two ways:

- keep the dedicated `admin-sso.timeh.my.id` standalone frontend with nginx proxy rules;
- route `admin-sso` through the portal BFF, which already has an admin proxy implementation.

ISS-D1 through ISS-D5 repaired the standalone path: nginx now proxies `/api/admin/*` and `/api/auth/*`, locks `/api/admin/* -> /admin/api/*`, preserves host-only cookies, rejects invalid upstream HTML responses in the API client, and runs a strict post-deploy `/api/admin/me` smoke.

## Evaluation

### Standalone admin frontend + nginx proxy

Benefits:

- smallest production change after ISS-D1 through ISS-D5;
- serves the admin bundle directly from the dedicated image;
- supports all backend admin routes without duplicating a BFF allowlist;
- keeps admin deployment and rollback independent from the portal runtime;
- is now covered by contract tests and post-deploy smoke.

Risks:

- duplicates some proxy behavior already present in the portal BFF;
- drift must be prevented by tests and production smoke;
- future session mediation changes must be applied deliberately to this path.

### Route admin-sso through the portal BFF

Benefits:

- consolidates proxy/session mediation in one Node layer;
- reduces duplicated proxy behavior over time.

Risks:

- the portal BFF currently serves the portal app, not the standalone admin bundle;
- the existing BFF admin allowlist is narrower than the current admin frontend feature surface;
- switching the host now would combine two deploy domains and increase blast radius;
- it would require a separate migration to serve admin assets and route fallback correctly.

## Decision

Keep `admin-sso.timeh.my.id` on the standalone admin frontend with nginx proxy for this release.

Do not route the whole admin host through the portal BFF yet. Revisit BFF consolidation only after there is a planned migration that provides:

- admin asset serving through the BFF or a shared static-serving layer;
- full `/api/admin/*` route parity with backend contracts;
- the same post-deploy smoke coverage currently enforced on the standalone route;
- an explicit rollback plan for the combined portal/admin runtime.

## Guardrails

- Keep `/api/admin/me` anonymous production smoke strict: HTTP 401, JSON content type, no HTML fallback, and `error=unauthorized` body.
- Keep nginx contract tests for `/api/admin/* -> /admin/api/*`, cookie forwarding, and host-only cookie behavior.
- Treat BFF consolidation as a separate architecture change, not an opportunistic route flip.
