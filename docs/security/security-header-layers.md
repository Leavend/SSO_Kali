# Security Header Layers

Security headers are enforced in three layers so a single proxy bypass or route
optimization does not remove browser-facing protections.

## Source of Truth

| Surface | Primary layer | Defense-in-depth layer | Notes |
| --- | --- | --- | --- |
| Portal UI `dev-sso.timeh.my.id` / `sso.timeh.my.id` | Frontend nginx (`services/sso-frontend/deploy/nginx.conf.template`) | Portal BFF Node (`services/sso-frontend/src/server/response.ts`) | Nginx owns public CSP/HSTS. BFF repeats core headers for direct/container access. |
| Admin UI | Admin nginx (`services/sso-admin-frontend/nginx.conf`) | Browser app is static only | Admin nginx owns CSP/clickjacking/referrer policy. |
| Backend API `api-sso.timeh.my.id` | Host nginx edge (`deploy/nginx/nginx-sso-backend-edge.conf`) | Laravel middleware (`ApplySecurityHeaders`) and Caddy (`services/sso-backend/docker/frankenphp/Caddyfile`) | Static edge routes such as `/up` and `/health` must set headers themselves because they do not reach Caddy/Laravel. |
| Identity broker `id.dev-sso.timeh.my.id` | Host nginx / broker edge | Broker container | Keep HSTS at the public edge even when the upstream is unhealthy. |

## Required Public Headers

Public HTTPS responses that can be reached by browsers must include:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer or strict-origin-when-cross-origin
X-Frame-Options: DENY or SAMEORIGIN where broker compatibility requires it
Content-Security-Policy: frame-ancestors 'none' for SSO-owned browser surfaces
```

Backend JSON/metadata endpoints use a restrictive CSP (`default-src 'none'`).
Frontend HTML uses the frontend nginx CSP because it must allow app scripts,
styles, fonts, images, and API connections.

## Production Verification

Run from outside the VPS after every edge/proxy change:

```bash
curl -fsSI https://api-sso.timeh.my.id/health | grep -Ei 'strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy'
curl -fsSI https://api-sso.timeh.my.id/.well-known/openid-configuration | grep -Ei 'strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy'
curl -kfsSI https://id.dev-sso.timeh.my.id | grep -Ei 'strict-transport-security|x-frame-options|x-content-type-options|referrer-policy'
```

If `/health` or `/up` misses HSTS/CSP while metadata has them, patch the host
nginx edge via `scripts/vps-apply-sso-operational-route-optimization.sh --mode apply`.
