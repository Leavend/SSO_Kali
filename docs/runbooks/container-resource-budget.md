# Container Resource Budget

## Goal

Define hard CPU and memory ceilings for the SSO stack so that one misbehaving container does not destabilize the VPS.

This follows Docker guidance to set memory limits because unchecked container memory consumption can trigger host-level OOM behavior, and `--cpus` constrains CPU access on Linux hosts. See Docker's official references:

- [Resource constraints | Docker Docs](https://docs.docker.com/engine/containers/resource_constraints/)
- [Compose services: `mem_limit` | Docker Docs](https://docs.docker.com/reference/compose-file/services/#mem_limit)
- [Compose deploy resources | Docker Docs](https://docs.docker.com/reference/compose-file/deploy/#resources)

## Production override

Source artifact: [docker-compose.prod.yml](/Users/leavend/Desktop/Project_SSO/docker-compose.prod.yml)

Apply it together with the base compose file:

```bash
docker compose \
  --env-file .env.dev \
  -f docker-compose.dev.yml \
  -f docker-compose.prod.yml \
  up -d
```

## Budget table

| Service | CPU limit | Memory limit | Memory reservation | Swap policy |
|---|---:|---:|---:|---|
| `proxy` | `0.50` | `256M` | `128M` | disabled by setting `memswap_limit=mem_limit` |
| `postgres` | `1.50` | `1024M` | `768M` | disabled |
| `redis` | `0.50` | `256M` | `128M` | disabled |
| `zitadel-api` | `1.50` | `1024M` | `768M` | disabled |
| `zitadel-login` | `0.75` | `384M` | `192M` | disabled |
| `sso-backend` | `1.00` | `768M` | `512M` | disabled |
| `sso-frontend` | `0.50` | `384M` | `192M` | disabled |
| `app-a-next` | `0.50` | `384M` | `192M` | disabled |
| `app-b-laravel` | `1.00` | `768M` | `512M` | disabled |

## CI policy check

Source artifact: [check-resource-budget.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-resource-budget.sh)

The lint fails if a critical container is missing:

- `cpus`
- `mem_limit`
- `mem_reservation`
- `memswap_limit`
- `deploy.resources.limits`
- `deploy.resources.reservations.memory`

It also enforces:

- `limits.cpus == cpus`
- `limits.memory == mem_limit`
- `memswap_limit == mem_limit`

## Runtime health check

Source artifact: [check-container-resource-health.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-container-resource-health.sh)

The runtime checker inspects:

- `State.OOMKilled` through `docker inspect`
- CPU throttling via cgroup `cpu.stat` and `nr_throttled`

Example:

```bash
COMPOSE_PROJECT_NAME=sso-prototype-dev \
./infra/sre/check-container-resource-health.sh
```

## Stress validation gate

Before production promotion:

1. Apply the production resource override in staging.
2. Run representative auth traffic and admin-panel traffic for at least 15 minutes.
3. Confirm:
   - no `OOMKilled=true`
   - no sustained throttling growth on `proxy`, `sso-backend`, or `zitadel-api`
   - host load average remains below the VPS operating threshold
4. Capture the checker output as deployment evidence.

## Roll-forward / rollback note

Changing resource limits is a container recreation event. Use the existing canary and rollback procedures from the proxy/migration runbooks rather than changing all services at once during peak traffic.
