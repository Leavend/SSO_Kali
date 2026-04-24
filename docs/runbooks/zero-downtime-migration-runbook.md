# Runbook: Zero-Downtime Migration for SSO Ingress

## Goal

Move SSO traffic from legacy direct upstreams to the chained `nginx -> traefik` path with a reversible rollout.

## Migration phases

### Phase 1: `/sso/*` canary lane

Source config: [dev-sso.timeh.my.id.canary-phase1.conf](/Users/leavend/Desktop/Project_SSO/infra/nginx/dev-sso.timeh.my.id.canary-phase1.conf)

- Public live paths remain on the legacy upstreams.
- A dedicated canary lane is exposed at `https://dev-sso.timeh.my.id/sso/*`.
- Requests on `/sso/*` are rewritten to the root path and proxied to `127.0.0.1:18080`.
- This phase validates:
  - chained proxy reachability
  - forwarded header correctness
  - OIDC authorize redirect integrity

### Phase 2: protected app paths

Source config: [dev-sso.timeh.my.id.canary-phase2.conf](/Users/leavend/Desktop/Project_SSO/infra/nginx/dev-sso.timeh.my.id.canary-phase2.conf)

- Keep the `/sso/*` canary lane.
- Move protected application paths to the new chain first:
  - `app-a.timeh.my.id/auth/*`
  - `app-b.timeh.my.id/auth/*`
  - `app-b.timeh.my.id/dashboard`
- Keep public landing traffic on legacy upstreams during this phase.

### Final cutover

Source config: [dev-sso.timeh.my.id.chained.conf](/Users/leavend/Desktop/Project_SSO/infra/nginx/dev-sso.timeh.my.id.chained.conf)

- All SSO hosts are served by the chained ingress.
- Legacy direct upstream path routing is removed.

## Apply a phase

Use [apply-zero-downtime-phase.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/apply-zero-downtime-phase.sh):

```bash
sudo ./infra/sre/apply-zero-downtime-phase.sh phase1
sudo ./infra/sre/apply-zero-downtime-phase.sh phase2
sudo ./infra/sre/apply-zero-downtime-phase.sh cutover
```

Each execution:

1. Backs up the active site file.
2. Installs the target phase config.
3. Runs `nginx -t`.
4. Reloads Nginx.

## Canary probes

Use [probe-zero-downtime-rollout.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/probe-zero-downtime-rollout.sh):

```bash
PHASE=phase1 ./infra/sre/probe-zero-downtime-rollout.sh
PHASE=phase2 ./infra/sre/probe-zero-downtime-rollout.sh
```

## Promotion gate

Before moving from one phase to the next:

1. Run the phase probe.
2. Run forwarded-header probes.
3. Evaluate canary SLOs.
4. Confirm no elevated `5xx`, auth callback failures, or JWKS refresh failures.

## CI jobs

Recommended pipeline stages:

1. `config-lint`
   - `./infra/sre/check-zero-downtime-migration-policy.sh`
2. `phase-probe`
   - `PHASE=phase1 ./infra/sre/probe-zero-downtime-rollout.sh`
3. `slo-gate`
   - `./infra/sre/evaluate-canary-slo.sh`
4. `rollback`
   - call [rollback-zero-downtime-migration.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/rollback-zero-downtime-migration.sh) when a gate fails
