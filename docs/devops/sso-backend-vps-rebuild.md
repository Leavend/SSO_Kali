# SSO Backend VPS Rebuild

This guide rebuilds only the new SSO Backend stack after removing legacy SSO containers.

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
  docker-compose.sso-backend.yml
  .env.prod
  .release.env
  scripts/vps-deploy-sso-backend.sh
  .secrets/oidc/private.pem
  .secrets/oidc/public.pem
```

Services:

```text
postgres
redis
sso-backend
sso-worker
```

Production responsibility split:

```text
sso-backend = HTTP/OIDC/OAuth API via FrankenPHP + Laravel Octane
sso-worker  = async queue jobs via php artisan queue:work redis
postgres    = durable relational state
redis       = cache, sessions, queues, rate limits
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

Copy files:

```text
docker-compose.sso-backend.yml -> /opt/sso-backend-prod/docker-compose.sso-backend.yml
scripts/vps-deploy-sso-backend.sh -> /opt/sso-backend-prod/scripts/vps-deploy-sso-backend.sh
.env.prod -> /opt/sso-backend-prod/.env.prod
```

Use `.env.sso-backend.example` as the template. Never commit real secrets.

## Required Secrets

```text
SSO_BACKEND_APP_KEY
POSTGRES_ADMIN_PASSWORD
SSO_BACKEND_DB_PASSWORD
REDIS_PASSWORD
OIDC private/public key pair
```

## Deploy

```bash
IMAGE_PREFIX=ghcr.io/leavend/sso-kali \
DEPLOY_TAG=sha-xxxxxxx \
PROJECT_DIR=/opt/sso-backend-prod \
bash /opt/sso-backend-prod/scripts/vps-deploy-sso-backend.sh
```

## Smoke Contract

The deploy script verifies:

```text
GET /up
GET /health
GET /.well-known/openid-configuration
GET /.well-known/jwks.json
sso-worker container health
```

Expected:

```text
200 OK
```

## Rollback

Redeploy a previous immutable image tag:

```bash
DEPLOY_TAG=sha-previous bash /opt/sso-backend-prod/scripts/vps-deploy-sso-backend.sh
```

Avoid DB rollback unless explicitly planned.

## Cleanup Policy

Do not run global prune:

```bash
# forbidden unless explicitly approved
docker system prune -a
```

Only remove SSO-specific resources when needed:

```text
sso-backend-prod_*
sso-kali_*
sso-prototype-dev_*
```
