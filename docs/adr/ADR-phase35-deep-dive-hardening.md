# ADR: Phase 35 — Deep Dive Audit & Hardening

- Status: Accepted
- Date: 2026-04-12
- Owners: IAM Architecture, Security Lead

## Context

A comprehensive deep-dive audit of the self-hosted ZITADEL SSO system (v4.11.0) was conducted. The system uses a Broker Pattern with Laravel as OIDC facade and Next.js as Admin Portal, running on a VPS behind an Nginx → Traefik → Docker proxy chain.

The audit examined 50+ files across infrastructure configs, Docker orchestration, Nginx vhosts, Traefik routing, ZITADEL bootstrapping, Broker backend (Laravel), Admin Frontend (Next.js), and downstream client applications.

## Findings & Decisions

### F1: Internal Issuer Hostname (P0 — Fixed)

**Before:** `ZITADEL_BROKER_INTERNAL_ISSUER=http://id.dev-sso.timeh.my.id:8080`

This used the public domain name with an internal Docker port. It appeared to work because `docker-compose.dev.yml` configured a network alias for `id.dev-sso.timeh.my.id` on the `zitadel-api` container. However, this blurred the boundary between internal and public addressing.

**After:** `ZITADEL_BROKER_INTERNAL_ISSUER=http://zitadel-api:8080`

Uses the Docker service name as the canonical internal hostname. The Docker network alias was also removed to enforce this boundary.

### F2: Forwarded Proto Mismatch (P0 — Fixed)

**Before:** The `zitadel-login` container's `CUSTOM_REQUEST_HEADERS` did not include `X-Forwarded-Proto:https`, though the base `docker-compose.yml` did.

**After:** Added `X-Forwarded-Proto:https` to `CUSTOM_REQUEST_HEADERS` in `docker-compose.dev.yml`.

The `sso-forwarded-headers.conf` Nginx snippet already correctly hardcodes `proxy_set_header X-Forwarded-Proto https;` for the chained configuration.

### F3: Session Cookie Host Binding (P0 — Fixed)

**Before:** `.env.dev` did not define `SSO_BACKEND_SESSION_COOKIE`, causing fallback to the default `laravel_session` name without `__Host-` prefix. This weakened subdomain cookie isolation.

**After:** Added `SSO_BACKEND_SESSION_COOKIE=__Host-broker_session`.

### F4: Redis Caching for ZITADEL (P1 — Enabled)

**Before:** All ZITADEL cache connectors pointed to `postgres`. Redis was running but unused by ZITADEL.

**After:** Enabled Redis caching for instance, milestones, and organization connectors. This reduces PostgreSQL load on hot-path data.

### F5: Access Token TTL (P1 — Reduced)

**Before:** `OIDC_ACCESS_TOKEN_TTL=60` (minutes).

**After:** `OIDC_ACCESS_TOKEN_TTL=15` (minutes), aligning with the `.env.dev.example` best practice.

### F6: Missing Environment Variables (P1 — Added)

Added all previously missing variables to `.env.dev` for env file completeness:
- `DEBUG_SSO_DOMAIN`
- All Telescope variables
- All rate limit variables
- `ADMIN_PANEL_SESSION_MANAGEMENT_ROLES`
- `ADMIN_PANEL_REQUIRE_MFA`
- `ADMIN_PANEL_MFA_ACCEPTED_AMR`
- Queue connection variables

### F7: Operational Scripts (P1 — Created)

Created two new operational scripts:
- `infra/zitadel/verify-forwarded-proto.sh` — validates HTTPS propagation through the entire proxy chain
- `infra/zitadel/simulate-jwks-rotation.sh` — tests JWKS cache eviction and refresh-on-kid-miss behavior

## Deferred Items

### MFA Enforcement

`ADMIN_PANEL_REQUIRE_MFA` remains `false`. Enabling it requires:
1. At least one admin enrolled in TOTP/U2F via ZITADEL
2. Running `audit-admin-mfa-readiness.sh` to confirm enrollment
3. Setting `ADMIN_PANEL_REQUIRE_MFA=true` and recreating `sso-backend`

### ZITADEL Root User in Base Compose

The base `docker-compose.yml` runs `zitadel-api` with `user: "0"`. The dev compose mitigates this with a custom Dockerfile that creates a dedicated `zitadel` user. The base compose should be updated if used directly.

## Verification

- `./deploy-dev.sh --preflight-only` validates compose config
- `./infra/zitadel/verify-forwarded-proto.sh` validates HTTPS chain
- `./infra/zitadel/simulate-jwks-rotation.sh` validates JWKS resilience
- Existing test suite: `./run-all-tests.sh`

## References

- [proxy-forwarded-header-snippets.md](/Users/leavend/Desktop/Project_SSO/docs/security/proxy-forwarded-header-snippets.md)
- [mfa-lockout-policy.md](/Users/leavend/Desktop/Project_SSO/docs/security/mfa-lockout-policy.md)
- [ADR-high-assurance-admin-access.md](/Users/leavend/Desktop/Project_SSO/docs/adr/ADR-high-assurance-admin-access.md)
