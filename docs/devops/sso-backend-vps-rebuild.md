# SSO Backend VPS Rebuild

This guide rebuilds only the production SSO Backend stack without touching other
applications on the VPS.

## Protected Existing Services

Do not touch these VPS services during SSO rebuild:

```text
cpbth-laravel-*
ngambis-laravel-*
n8n-n8n-1
ideation-*
roundcube-db
portainer
bth-postgres-db
```

## Target Runtime

```text
/opt/sso-backend-prod
  docker-compose.main.yml
  .env.prod
  .release.env
  scripts/vps-deploy-main.sh
  scripts/sso-backend-vps-smoke.sh
  .secrets/oidc/private.pem
  .secrets/oidc/public.pem
```

Services:

```text
postgres
redis
sso-backend
sso-backend-worker
```

Production responsibility split:

```text
sso-backend        = HTTP/OIDC/OAuth API via FrankenPHP + Laravel Octane
sso-backend-worker = async queue jobs via php artisan queue:work redis
postgres           = durable relational state
redis              = cache, sessions, queues, rate limits
```

Published backend port:

```text
127.0.0.1:8200 -> sso-backend:8000
```

## First-Time VPS Setup

```bash
sudo install -d -m 0755 /opt/sso-backend-prod
sudo install -d -m 0755 /opt/sso-backend-prod/scripts
sudo install -d -m 0750 /opt/sso-backend-prod/.secrets/oidc
```

Copy files through the GitHub Actions deploy workflow by providing the required
repository secrets. Manual copy is for emergency recovery only.

```text
docker-compose.main.yml -> /opt/sso-backend-prod/docker-compose.main.yml
scripts/vps-deploy-main.sh -> /opt/sso-backend-prod/scripts/vps-deploy-main.sh
scripts/sso-backend-vps-smoke.sh -> /opt/sso-backend-prod/scripts/sso-backend-vps-smoke.sh
.env.prod -> /opt/sso-backend-prod/.env.prod
```

Never commit real secrets.

## Required Secrets

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
VPS_SSH_PORT
VPS_PROJECT_DIR
VPS_ENV_PROD
SSO_BACKEND_APP_KEY
POSTGRES_ADMIN_PASSWORD
SSO_BACKEND_DB_PASSWORD
REDIS_PASSWORD
OIDC private/public key pair
```

## Deploy Path

Preferred production deploy path:

```text
GitHub Actions -> SSO Backend Deploy -> workflow_dispatch
```

Inputs:

```text
image_tag=sha-xxxxxxx
dry_run=false
run_smoke=true
public_base_url=https://api-sso.timeh.my.id
```

Emergency manual deploy is allowed only when GitHub Actions is unavailable:

```bash
IMAGE_PREFIX=ghcr.io/leavend/sso-kali \
DEPLOY_TAG=sha-xxxxxxx \
PROJECT_DIR=/opt/sso-backend-prod \
bash /opt/sso-backend-prod/scripts/vps-deploy-main.sh
```

## Smoke Contract

The deploy workflow and smoke script verify:

```text
GET /up
GET /health
GET /.well-known/openid-configuration
GET /.well-known/jwks.json
backend-only topology
sso-backend-worker presence
forbidden sso-admin-vue absence
worker logs without immediate failure markers
```

Expected:

```text
200 OK
```

## Rollback

Redeploy a previous immutable image tag through GitHub Actions:

```text
SSO Backend Deploy -> image_tag=sha-previous
```

Emergency fallback:

```bash
DEPLOY_TAG=sha-previous bash /opt/sso-backend-prod/scripts/vps-deploy-main.sh
```

Avoid DB rollback unless explicitly planned and backed by the backup/restore
runbook.

## Cleanup Policy

Do not run global prune:

```bash
# forbidden unless explicitly approved
# docker system prune -a --volumes
```

Only remove SSO-specific resources when needed and after backup review:

```text
sso-backend-prod_*
sso-kali_*
sso-prototype-dev_*
```
