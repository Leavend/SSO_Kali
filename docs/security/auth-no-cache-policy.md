# Auth No-Cache Policy

## Policy Statement
All authentication and admin-bootstrap surfaces MUST be delivered with non-cacheable headers at both the application and edge proxy layers.

## Required Headers
- `Cache-Control: no-store, no-cache, private, max-age=0, must-revalidate`
- `Pragma: no-cache`
- `Expires: 0`
- `Surrogate-Control: no-store`

## Protected Paths
- Broker:
  - `/authorize`
  - `/oauth2/authorize`
  - `/token`
  - `/oauth2/token`
  - `/revocation`
  - `/oauth2/revocation`
  - `/connect/register-session`
  - `/connect/logout`
  - `/callbacks/*`
- Admin bootstrap and high-assurance frontend:
  - `/admin/api/*`
  - `/auth/*`
  - `/access-denied`
  - `/reauth-required`
  - `/invalid-credentials`
  - `/handshake-failed`

## Rationale
- Prevent browser back/forward cache from replaying stale login or callback state.
- Prevent reverse proxies from caching auth redirects, callback responses, or admin principal payloads.
- Ensure `auth_time`, permissions, and session freshness are always re-evaluated from a live response.

## Enforcement Layers
1. Laravel broker middleware applies no-store headers to sensitive broker and admin API responses.
2. Nginx auth-sensitive locations hide upstream cache headers and set canonical no-store headers.
3. Cookie policy remains host-only and must never add a `Domain` attribute in transit.

## Deployment Notes
- Reload Nginx gracefully with `nginx -t && systemctl reload nginx`.
- No full stack restart is required for edge-header updates.
