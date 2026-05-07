# SSO Backend Backup and Restore Runbook

## Scope

Production path:

```text
/opt/sso-backend-prod
```

Critical assets:

```text
.env.prod
.release.env
.secrets/oidc/private.pem
.secrets/oidc/public.pem
postgres-data volume
redis-data volume, optional
```

## Backup

Run on VPS as root or sudo user.

```bash
set -Eeuo pipefail
PROJECT_DIR=/opt/sso-backend-prod
TS=$(date -u +%Y%m%d_%H%M%S)
BACKUP_DIR="$PROJECT_DIR/backups/$TS"
mkdir -p "$BACKUP_DIR"
chmod 0750 "$BACKUP_DIR"

cd "$PROJECT_DIR"

# Copy runtime metadata and secrets.
cp -a .env.prod "$BACKUP_DIR/env.prod"
cp -a .release.env "$BACKUP_DIR/release.env" 2>/dev/null || true
cp -a .secrets "$BACKUP_DIR/secrets"
chmod -R go-rwx "$BACKUP_DIR"

# Dump Postgres in custom compressed format.
docker compose --env-file .env.prod -f docker-compose.sso-backend.yml exec -T postgres \
  pg_dump -U "${POSTGRES_ADMIN_USER:-postgres}" \
  -d "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}" \
  --format=custom --compress=9 \
  > "$BACKUP_DIR/postgres.dump"

sha256sum "$BACKUP_DIR"/* > "$BACKUP_DIR/SHA256SUMS"
```

## Restore

> [!CAUTION]
> Restore overwrites production state. Stop traffic or perform this only in a planned maintenance window.

```bash
set -Eeuo pipefail
PROJECT_DIR=/opt/sso-backend-prod
BACKUP_DIR=/opt/sso-backend-prod/backups/YYYYMMDD_HHMMSS

cd "$PROJECT_DIR"

cp -a "$BACKUP_DIR/env.prod" .env.prod
cp -a "$BACKUP_DIR/secrets" .secrets
chmod 0600 .env.prod
chmod -R go-rwx .secrets

docker compose --env-file .env.prod -f docker-compose.sso-backend.yml up -d postgres redis

docker compose --env-file .env.prod -f docker-compose.sso-backend.yml exec -T postgres \
  dropdb -U "${POSTGRES_ADMIN_USER:-postgres}" --if-exists "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}"

docker compose --env-file .env.prod -f docker-compose.sso-backend.yml exec -T postgres \
  createdb -U "${POSTGRES_ADMIN_USER:-postgres}" "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}"

cat "$BACKUP_DIR/postgres.dump" | docker compose --env-file .env.prod -f docker-compose.sso-backend.yml exec -T postgres \
  pg_restore -U "${POSTGRES_ADMIN_USER:-postgres}" \
  -d "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}" \
  --clean --if-exists

IMAGE_PREFIX=ghcr.io/leavend/sso-kali \
DEPLOY_TAG=$(grep '^SSO_DEPLOY_TAG=' "$BACKUP_DIR/release.env" | cut -d= -f2-) \
PROJECT_DIR="$PROJECT_DIR" \
bash "$PROJECT_DIR/scripts/vps-deploy-sso-backend.sh"
```

## Verification

```bash
curl -fsS http://127.0.0.1:8200/up
curl -fsS http://127.0.0.1:8200/health
curl -fsS http://127.0.0.1:8200/.well-known/openid-configuration
curl -fsS http://127.0.0.1:8200/.well-known/jwks.json
```

If DNS/TLS is ready:

```bash
curl -fsS https://api-sso.timeh.my.id/up
curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration
```

## Retention

Recommended minimum:

```text
hourly: 24 copies
daily: 14 copies
weekly: 8 copies
monthly: 6 copies
```

Encrypt and offload backups outside the VPS for real disaster recovery.
