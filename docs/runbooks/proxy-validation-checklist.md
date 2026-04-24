# Proxy Validation Checklist

## Scope
- Public edge: Nginx chained front door
- Internal proxy: Traefik on loopback entrypoints
- Auth-sensitive paths: broker `/authorize`, `/oauth2/authorize`, `/callbacks/*`, `/token`, `/revocation`, `/connect/*`
- Admin frontend paths: `/auth/*`, `/admin/api/*`, `/reauth-required`, `/access-denied`, `/invalid-credentials`, `/handshake-failed`

## Pre-Reload Checks
1. Confirm Nginx keeps `proxy_pass http://sso_traefik_web;` without a URI suffix on auth-sensitive locations.
2. Confirm auth-sensitive locations include `/etc/nginx/snippets/sso-auth-sensitive-proxy.conf`.
3. Confirm `/etc/nginx/snippets/sso-auth-sensitive-proxy.conf` includes:
   - `include /etc/nginx/snippets/sso-forwarded-headers.conf;`
   - `proxy_pass_request_headers on;`
   - `proxy_cookie_domain off;`
   - `add_header Cache-Control "no-store, no-cache, private, max-age=0, must-revalidate" always;`
4. Confirm Traefik still trusts forwarded headers only from loopback.
5. Run:
   - `bash /opt/sso-prototype-dev/infra/sre/check-forwarded-header-policy.sh`
   - `bash /opt/sso-prototype-dev/infra/sre/check-auth-edge-hardening.sh`
   - `nginx -t`

## Live Validation
1. Start an admin sign-in from `https://dev-sso.timeh.my.id/`.
2. Inspect the first redirect and confirm `prompt=login` and `max_age=0` survive the proxy chain.
3. Complete the hosted login and confirm callback retains `state` and `code`.
4. Confirm auth responses carry:
   - `Cache-Control: no-store, no-cache, private, max-age=0, must-revalidate`
   - `Pragma: no-cache`
   - `Expires: 0`
5. Confirm broker cookies remain host-only:
   - name starts with `__Host-`
   - `Secure`
   - `Path=/`
   - no `Domain`

## Failure Signals
- Missing `prompt=login` or `max_age=0` on upstream authorize redirect
- Callback breaks with lost `state` or `code`
- `Set-Cookie` contains `Domain=`
- Auth pages return cacheable headers
- Nginx reload fails `nginx -t`
