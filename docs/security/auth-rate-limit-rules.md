# Auth Rate-Limit Rules

## Edge Rules (Nginx)
- `sso_frontend_login_per_ip`
  - scope: `/auth/login`
  - rate: `20 requests/minute per source IP`
  - burst: `10`
- `sso_broker_authorize_per_ip`
  - scope: `/authorize`, `/oauth2/authorize`
  - rate: `120 requests/minute per source IP`
  - burst: `40`
- `sso_broker_callback_per_ip`
  - scope: `/callbacks/*`
  - rate: `180 requests/minute per source IP`
  - burst: `60`
- `sso_frontend_callback_per_ip`
  - scope: `/auth/callback`
  - rate: `30 requests/minute per source IP`
  - burst: `20`
- `sso_admin_bootstrap_per_ip`
  - scope: `/admin/api/*`
  - rate: `60 requests/minute per source IP`
  - burst: `30`

## Application Rules (Laravel)
- `oidc-authorize`
  - scope: broker `/authorize`, `/oauth2/authorize`
  - default: `20 req/min`
- `oidc-callback`
  - scope: broker `/callbacks/zitadel`
  - default: `30 req/min`
- `admin-bootstrap`
  - scope: `/admin/api/me`
  - default: `20 req/min`
- `admin-read`
  - scope: non-destructive admin API reads
  - default: `60 req/min`
- `admin-write`
  - scope: destructive admin actions
  - default: `10 req/min`

## Operational Notes
- Edge limits absorb volumetric bursts before requests reach app containers.
- Broker-facing edge budgets are intentionally higher than Laravel budgets so OIDC routes can still return semantic broker errors such as `too_many_attempts`.
- Frontend-only auth routes keep tighter edge limits because they do not need broker-style redirect semantics.
- Step-up reauthentication uses the same authorize budget as first-time admin sign-in.
