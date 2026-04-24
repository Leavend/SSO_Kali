# Runbook: Zero-Downtime Rollback

## Goal

Revert canary or cutover ingress changes with one operational step: restore the previous Nginx site file and reload Nginx.

## One-step rollback

Use [rollback-zero-downtime-migration.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/rollback-zero-downtime-migration.sh):

```bash
sudo ./infra/sre/rollback-zero-downtime-migration.sh \
  /etc/nginx/sites-available/backups/dev-sso.timeh.my.id.pre-phase2-YYYYMMDD-HHMMSS
```

The script:

1. Restores the chosen backup into `/etc/nginx/sites-available/dev-sso.timeh.my.id`
2. Runs `nginx -t`
3. Reloads `nginx`

## Rollback triggers

- `5xx` rate exceeds threshold during canary
- p95 auth latency exceeds threshold
- authorization redirects or callback URLs break
- forwarded-host/proto mismatch warnings spike
- JWKS refresh failure rate exceeds threshold

## Automatic gate

Use [evaluate-canary-slo.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/evaluate-canary-slo.sh). If the script exits non-zero, the rollback job should execute immediately.

Example:

```bash
CANARY_SUCCESS_RATE=98.8 \
CANARY_5XX_RATE=1.4 \
CANARY_P95_MS=910 \
./infra/sre/evaluate-canary-slo.sh || \
sudo ./infra/sre/rollback-zero-downtime-migration.sh \
  /etc/nginx/sites-available/backups/dev-sso.timeh.my.id.pre-phase2-YYYYMMDD-HHMMSS
```

## Post-rollback verification

```bash
curl -kI https://dev-sso.timeh.my.id/
curl -kI https://app-a.timeh.my.id/auth/login
curl -kI https://app-b.timeh.my.id/auth/login
```
