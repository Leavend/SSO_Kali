# ADR: VPS Coexistence Strategy for Nginx + Traefik

## Status

Accepted for staging rollout.

## Context

The VPS already serves live HTTP and HTTPS traffic for multiple non-SSO services.
The SSO stack also uses Traefik for internal host and path routing.
Allowing both host Nginx and Docker Traefik to bind public `:80` and `:443` would create port conflicts and make rollback unsafe.

## Decision

Use a chained proxy model:

- Host `nginx` remains the only public owner of `:80` and `:443`.
- Docker `traefik` listens on container entryPoints `web=:80` and `websecure=:443`.
- Host publication for Traefik is restricted to loopback high ports:
  - `127.0.0.1:18080 -> traefik:web`
  - `127.0.0.1:18443 -> traefik:websecure`
- Nginx terminates TLS and forwards requests to Traefik over loopback.
- Traefik continues to own internal host/path routing for:
  - `dev-sso.timeh.my.id`
  - `id.dev-sso.timeh.my.id`
  - `app-a.timeh.my.id`
  - `app-b.timeh.my.id`

## Why this was chosen

- Preserves coexistence with existing VPS public web stack.
- Keeps one clear owner for public ports.
- Makes rollback a single Nginx rule change instead of a full ingress swap.
- Avoids duplicated host/path routing logic across multiple public listeners.

## Rejected alternatives

### Traefik binds public `:80/:443`

Rejected because the VPS already runs live sites behind host Nginx.
Taking over public ports would create service interruption risk and a more complex rollback path.

### Nginx routes directly to every app container

Rejected because it duplicates router logic that already exists in Traefik labels.
That increases drift risk for OIDC callback paths and identity hostnames.

## Consequences

- Header correctness becomes mandatory across the Nginx -> Traefik chain.
- Public TLS policy lives in Nginx.
- Internal routing policy lives in Traefik.
- CI must fail if Traefik is ever published directly to host `:80/:443`.
