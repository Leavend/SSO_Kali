# ADR: Telescope Debug Subdomain Isolation

- Status: Proposed
- Date: 2026-04-06
- Owners: Platform Engineering, Security Lead

## Context

`Laravel Telescope` is currently exposed on the same origin as the Admin Panel:

- `https://dev-sso.timeh.my.id/telescope`

This was an acceptable emergency debugging choice for the development rollout because:

- it avoided a second TLS surface during the hotfix window
- it reduced time-to-debug for live OIDC failures
- it allowed Telescope to be protected with HTTP Basic Auth immediately

Live request analysis showed an undesirable side effect:

- the browser can attach same-origin Basic Auth credentials to normal application requests
- Telescope-specific auth headers can therefore appear in unrelated request logs
- this increases noise and weakens boundary separation between debug traffic and production user traffic

The current setup is functional, but it is not the desired steady-state architecture.

## Decision

Telescope must move to a **dedicated debug subdomain** in the next infrastructure iteration.

Recommended target:

- `https://debug.dev-sso.timeh.my.id/telescope`

The debug subdomain must:

- terminate separately at the edge
- route only to `sso-backend`
- remain disabled by default outside explicitly allowed environments
- require at least one independent control in addition to environment gating:
  - IP allowlist
  - HTTP Basic Auth
  - VPN or private access path

## Why This Decision

Moving Telescope off the main Admin Panel origin:

- prevents same-origin auth header bleed into normal broker and admin requests
- restores a clean boundary between debugging and user traffic
- makes security review easier because debug access becomes an explicitly isolated surface
- reduces the chance that browser behavior interferes with OIDC troubleshooting

## Rejected Alternative

Keep Telescope on `dev-sso.timeh.my.id` and rely only on Basic Auth.

This is rejected as the long-term model because:

- it couples debug access to the application origin
- it permits confusing header behavior in browser sessions
- it makes it easier to accidentally inspect or influence normal user flows while debugging

## Required Future Controls

The dedicated debug subdomain should be released only with all of the following:

- edge routing for `debug.dev-sso.timeh.my.id`
- separate Nginx / Traefik router rule from the main Admin Panel origin
- no shared cookies with the Admin Panel origin
- no auth UI links from the public Admin Panel
- strict `no-store` headers
- IP allowlist or equivalent network restriction
- Basic Auth or stronger operator authentication

## Migration Outline

1. Create a DNS record for `debug.dev-sso.timeh.my.id`.
2. Add a dedicated edge virtual host / router rule.
3. Route only `/telescope` and `/vendor/telescope` traffic on the debug host to `sso-backend`.
4. Remove Telescope routing from the main `dev-sso.timeh.my.id` host.
5. Re-verify that normal Admin Panel requests no longer carry Telescope auth headers.

## Rollback

If the debug subdomain rollout fails:

1. disable the new debug host routing
2. keep Telescope disabled on the public host unless active incident response requires temporary recovery
3. if emergency access is required, re-enable the current same-origin model only as a time-boxed incident exception

## As-Built Note

As of 2026-04-06:

- Telescope is live on `https://dev-sso.timeh.my.id/telescope`
- it is protected by Basic Auth and environment gating
- this ADR records that the current setup is a temporary debugging posture, not the target steady state
