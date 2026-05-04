# ZITADEL Live Performance Optimization Runbook

Date: 2026-05-04
Scope: dev-sso live identity path (`id.dev-sso.timeh.my.id`) and Project SSO control-plane deploy.

## Problem Statement

Users reported that accessing the ZITADEL-backed login flow felt heavy. Live probes showed small HTML and asset payloads, but identity endpoints had intermittent TTFB spikes above 2 seconds. That points to runtime path pressure around ZITADEL, PostgreSQL, and reverse proxy reconciliation rather than a frontend bundle-size issue.

## Findings

- The active Vue login HTML is small and static assets are already immutable.
- ZITADEL instance and organization lookups were not cached in the live Compose control plane.
- ZITADEL and PostgreSQL runtime limits in `docker-compose.dev.yml` were lower than the production budget overlay.
- The registry deploy script copied the new Compose file to the VPS, but did not reconcile `zitadel-api`; therefore config-only ZITADEL changes could be shipped without taking effect.
- Public blackbox monitoring covered generic uptime, but not the active Vue login URL or ZITADEL discovery latency.

## Optimization Applied

- Enable ZITADEL local memory cache for instance and organization objects on the single-node deployment.
- Keep Redis cache disabled until connector compatibility is validated, avoiding an unsafe cache backend change during a live performance fix.
- Increase the live ZITADEL and PostgreSQL resource ceilings to match the documented runtime budget.
- Add a dedicated identity web resource budget for hosted login and Vue login services.
- Add deploy-time reconciliation for `zitadel-api` with health-gated rollback.
- Add Compose control-plane snapshot restoration before rollback.
- Add public blackbox probes and alerts for Vue login and OIDC discovery latency.

## Rollback

The CD pipeline already backs up the previous Compose file before installing the new one. On health or smoke failure, `scripts/vps-deploy.sh` restores that Compose snapshot, restores any environment migration snapshot, and then invokes image rollback through `scripts/vps-rollback.sh` when a previous release tag is available.

Manual rollback path:

```bash
sudo cp /opt/sso-prototype-dev/docker-compose.dev.yml.pre-<sha> /opt/sso-prototype-dev/docker-compose.dev.yml
sudo bash /opt/sso-prototype-dev/scripts/vps-rollback.sh \
  --tag <previous-tag> \
  --registry ghcr.io/leavend/sso-prototype \
  --project-dir /opt/sso-prototype-dev
```

## Zero-Downtime Note

The current live ZITADEL runtime is a single `zitadel-api` container. This change is health-gated and rollback-safe, but strict zero downtime for identity runtime replacement requires at least two ZITADEL application replicas and a shared cache strategy. For single-node memory cache, scale-out should not be enabled permanently without revisiting cache consistency.

## SLO Guardrails

- Vue login probe latency: alert above 2 seconds for 5 minutes.
- ZITADEL OIDC discovery latency: alert above 2 seconds for 5 minutes.
- Existing public blackbox uptime remains the hard availability signal.
