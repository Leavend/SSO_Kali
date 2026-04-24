# Telescope Debugging Runbook

## Purpose

Enable deep request / query / cache / exception inspection on `dev-sso` without exposing Telescope as a public debug dashboard.

## Access Model

- Telescope runs inside `sso-backend`
- It is enabled only when `TELESCOPE_ENABLED=true`
- It is limited to the configured environments in `TELESCOPE_ALLOWED_ENVIRONMENTS`
- Access requires HTTP Basic Auth when `TELESCOPE_BASIC_AUTH_USER` and `TELESCOPE_BASIC_AUTH_PASSWORD` are set
- `TELESCOPE_ALLOWED_IPS` may be used to add an IP or CIDR allowlist

## URL

- `https://debug.dev-sso.timeh.my.id/telescope`

## Temporary Architecture Note

- Telescope is isolated to the dedicated debug host `debug.dev-sso.timeh.my.id`
- The main admin host `dev-sso.timeh.my.id` must not expose `/telescope`
- See [ADR: Telescope Debug Subdomain Isolation](/Users/leavend/Desktop/Project_SSO/docs/adr/ADR-telescope-debug-subdomain.md)

## Required Environment

- `TELESCOPE_ENABLED=true`
- `TELESCOPE_ALLOWED_ENVIRONMENTS=dev`
- `TELESCOPE_BASIC_AUTH_USER=<debug username>`
- `TELESCOPE_BASIC_AUTH_PASSWORD=<debug password>`
- optional: `TELESCOPE_ALLOWED_IPS=<comma-separated IP or CIDR ranges>`

## Operational Notes

- Telescope traffic is routed to `sso-backend` through Traefik by `PathPrefix(/telescope)` and `PathPrefix(/vendor/telescope)`
- Telescope data is stored in the primary application database
- Retention is controlled by `TELESCOPE_PRUNE_HOURS`
- Daily pruning runs via `php artisan telescope:prune`

## Rollback

1. Set `TELESCOPE_ENABLED=false`
2. Recreate only `sso-backend`
3. Confirm `https://debug.dev-sso.timeh.my.id/telescope` returns `404`

## Verification

1. Open `https://debug.dev-sso.timeh.my.id/telescope`
2. Confirm browser prompts for HTTP Basic Auth
3. Confirm valid credentials load the dashboard
4. Trigger a known request such as `/authorize`
5. Confirm request, query, cache, and exception entries appear
