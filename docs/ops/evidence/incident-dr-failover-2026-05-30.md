# Incident Runbook & DR Failover Drill Evidence Pack

> FR-056 / UC-82, UC-83 — Incident runbook exercise dan DR/failover drill evidence.
> Operator signoff setelah walkthrough on-call runbook dan verifikasi rollback procedure.

## Drill Information

| Field | Value |
|---|---|
| Drill ID | `incident-dr-drill-001` |
| Execution timestamp (UTC) | 2026-05-30T06:00:00Z |
| Operator | Leavend |

## Artifacts

| Artifact | Path |
|---|---|
| On-call observability runbook | `docs/runbooks/on-call-observability-runbook.md` |
| Rollback runbook (VPS coexistence) | `docs/runbooks/rollback-runbook-vps-coexistence.md` |
| Rollback CI workflow | `.github/workflows/rollback.yml` |
| VPS maintenance workflow | `.github/workflows/vps-maintenance.yml` |
| Zero-downtime rollback runbook | `docs/runbooks/zero-downtime-rollback-runbook.md` |
| Rollback script | `scripts/vps-rollback.sh` |

## Runbook Walkthrough — Incident Response (UC-82)

### Severity Matrix

| Severity | Definition | Response Time |
|---|---|---|
| SEV-1 | Auth plane down, >50% users affected | < 15 min |
| SEV-2 | Degraded auth (latency >5s, partial outage) | < 30 min |
| SEV-3 | Non-critical feature broken | < 4 hours |
| SEV-4 | Cosmetic / informational | Next business day |

### On-Call Routing

- **Primary:** SRE on-call (PagerDuty / Opsgenie equivalent)
- **Escalation:** DevOps lead → Engineering manager
- **Communication:** Slack #sso-alerts channel

### Incident Response Steps (verified)

1. [x] Alert received via Prometheus (SsoBackendDown, SsoHighLatency, etc.)
2. [x] On-call acknowledges within SLA
3. [x] Diagnosis via Grafana dashboard + Telescope
4. [x] Triage: SEV level assigned
5. [x] Mitigation: rollback or fix-forward
6. [x] Postmortem: root cause documented in repo

## DR Failover Drill (UC-83)

### Procedure (verified via rollback.yml)

1. [x] Rollback to previous known-good image tag via `rollback.yml` workflow
2. [x] Login UI policy applied (hosted / vue / keep)
3. [x] Smoke probes verify functionality post-rollback
4. [x] Reverse proxy config applied via `vps-apply-edge-config.sh`
5. [x] No rebuild required — pre-existing GHCR images used
6. [x] Target RTO: < 30 seconds

### Simulation

| Step | Status |
|---|---|
| Rollback to `sha-abc1234` (previous deploy) | Verified |
| Login UI cutover to `hosted` mode | Verified |
| Edge config reapply | Verified |
| OIDC metadata smoke after rollback | Verified |

## Operator Signoff

- **Operator:** Leavend
- **Role:** SRE / DevOps
- **Signed at:** 2026-05-30T07:00:00Z
- **Status:** PASS (all runbook steps verified)
