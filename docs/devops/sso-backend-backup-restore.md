# SSO Backend Backup and Restore Runbook

This runbook covers production backup, verification, and restore rehearsal for
the backend-only SSO stack.

## Scope

Production source of truth:

```text
/opt/sso-backend-prod
/opt/sso-backend-prod/docker-compose.main.yml
/opt/sso-backend-prod/.env.prod
```

Production containers:

```text
sso-backend-prod-sso-backend-1
sso-backend-prod-sso-backend-worker-1
sso-backend-prod-redis-1
sso-backend-prod-postgres-1
```

Critical assets:

```text
.env.prod
.release.env
.secrets/oidc/private.pem
.secrets/oidc/public.pem
postgres-data volume
sso-backend-storage volume
redis-data volume, optional ephemeral queue/cache state
```

> [!IMPORTANT]
> A backup is not production-grade until checksum verification and a restore
> rehearsal have succeeded.

## Safety Rules

```text
Do not run docker system prune.
Do not delete Docker volumes during backup or restore rehearsal.
Do not paste .env.prod, private keys, dumps, or checksums into public chat.
Do not restore directly into production without a maintenance window.
```

## Backup Procedure

Run on the VPS as an operator with Docker access.

```bash
set -Eeuo pipefail

PROJECT_DIR=/opt/sso-backend-prod
COMPOSE_FILE="$PROJECT_DIR/docker-compose.main.yml"
ENV_FILE="$PROJECT_DIR/.env.prod"
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_ROOT="$PROJECT_DIR/backups/production"
BACKUP_DIR="$BACKUP_ROOT/$TS"

mkdir -p "$BACKUP_DIR"
chmod 0750 "$BACKUP_ROOT" "$BACKUP_DIR"
cd "$PROJECT_DIR"

# Preserve deployment metadata and secrets with restricted permissions.
cp -a .env.prod "$BACKUP_DIR/env.prod"
cp -a .release.env "$BACKUP_DIR/release.env" 2>/dev/null || true
cp -a docker-compose.main.yml "$BACKUP_DIR/docker-compose.main.yml"
cp -a .secrets "$BACKUP_DIR/secrets"
chmod -R go-rwx "$BACKUP_DIR"

# Dump PostgreSQL in custom compressed format from the production container.
docker exec -i sso-backend-prod-postgres-1 pg_dump \
  -U "${POSTGRES_ADMIN_USER:-sso}" \
  -d "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}" \
  --format=custom --compress=9 \
  > "$BACKUP_DIR/postgres.dump"

# Capture metadata useful for audit and restore selection.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps > "$BACKUP_DIR/docker-compose-ps.txt"
docker image inspect sso-backend-prod-sso-backend-1 > "$BACKUP_DIR/backend-image.json" 2>/dev/null || true

# Checksum everything after files are fully written.
(
  cd "$BACKUP_DIR"
  sha256sum env.prod docker-compose.main.yml postgres.dump > SHA256SUMS
  [ ! -f release.env ] || sha256sum release.env >> SHA256SUMS
)

printf 'backup_dir=%s\n' "$BACKUP_DIR"
```

## Backup Verification

```bash
set -Eeuo pipefail
BACKUP_DIR=/opt/sso-backend-prod/backups/production/YYYYMMDDTHHMMSSZ
cd "$BACKUP_DIR"
sha256sum -c SHA256SUMS
pg_restore --list postgres.dump >/tmp/sso-backend-pg-restore-list.txt
```

Expected:

```text
env.prod: OK
docker-compose.main.yml: OK
postgres.dump: OK
```

## Restore Rehearsal

Perform restore rehearsal on a staging host or isolated Docker project, not on
live production.

```bash
set -Eeuo pipefail

PROJECT_DIR=/opt/sso-backend-prod-restore-drill
BACKUP_DIR=/opt/sso-backend-prod/backups/production/YYYYMMDDTHHMMSSZ
COMPOSE_PROJECT_NAME=sso-backend-restore-drill

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

cp -a "$BACKUP_DIR/env.prod" .env.prod
cp -a "$BACKUP_DIR/docker-compose.main.yml" docker-compose.main.yml
cp -a "$BACKUP_DIR/secrets" .secrets
chmod 0600 .env.prod
chmod -R go-rwx .secrets

sha256sum -c "$BACKUP_DIR/SHA256SUMS"

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose --env-file .env.prod -f docker-compose.main.yml up -d postgres redis

cat "$BACKUP_DIR/postgres.dump" | COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose --env-file .env.prod -f docker-compose.main.yml exec -T postgres \
  pg_restore -U "${POSTGRES_ADMIN_USER:-sso}" \
  -d "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}" \
  --clean --if-exists --no-owner --no-privileges

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose --env-file .env.prod -f docker-compose.main.yml up -d sso-backend sso-backend-worker
```

Verify rehearsal:

```bash
COMPOSE_PROJECT_NAME=sso-backend-restore-drill \
  docker compose --env-file .env.prod -f docker-compose.main.yml ps

curl -fsS http://127.0.0.1:8200/up
curl -fsS http://127.0.0.1:8200/ready
curl -fsS http://127.0.0.1:8200/.well-known/openid-configuration
curl -fsS http://127.0.0.1:8200/.well-known/jwks.json
```

> [!NOTE]
> If the rehearsal runs on the same VPS, override published ports first to avoid
> conflict with production. Prefer a separate staging host for restore drills.

## Production Restore Procedure

> [!CAUTION]
> Production restore overwrites live state. Use a planned maintenance window and
> confirm recent backup checksum verification before proceeding.

1. Announce maintenance window.
2. Take a fresh pre-restore backup using the backup procedure above.
3. Verify `sha256sum -c SHA256SUMS` on the selected backup.
4. Stop the application and worker, keep PostgreSQL available.
5. Restore PostgreSQL dump.
6. Restart services through the GitHub Actions deploy workflow or
   `scripts/vps-deploy-main.sh` only if manual emergency deploy is approved.
7. Smoke public endpoints.

Example database restore step:

```bash
set -Eeuo pipefail
PROJECT_DIR=/opt/sso-backend-prod
BACKUP_DIR=/opt/sso-backend-prod/backups/production/YYYYMMDDTHHMMSSZ
cd "$PROJECT_DIR"

sha256sum -c "$BACKUP_DIR/SHA256SUMS"

docker compose --env-file .env.prod -f docker-compose.main.yml stop sso-backend sso-backend-worker

cat "$BACKUP_DIR/postgres.dump" | docker exec -i sso-backend-prod-postgres-1 \
  pg_restore -U "${POSTGRES_ADMIN_USER:-sso}" \
  -d "${POSTGRES_DB:-${SSO_BACKEND_DB:-sso_backend}}" \
  --clean --if-exists --no-owner --no-privileges
```

After DB restore, prefer GitHub Actions deploy to reconcile image tag, caches,
worker, and service health.

## Verification After Restore

From local workstation:

```bash
scripts/sso-backend-vps-smoke.sh \
  --host 145.79.15.8 \
  --user tio \
  --public-base-url https://api-sso.timeh.my.id
```

Direct VPS checks:

```bash
curl -fsS http://127.0.0.1:8200/up
curl -fsS http://127.0.0.1:8200/ready | jq
curl -fsS https://api-sso.timeh.my.id/up
curl -fsS https://api-sso.timeh.my.id/ready | jq
```

Queue/worker checks:

```bash
docker logs --tail 200 sso-backend-prod-sso-backend-worker-1 | grep 'sso.worker_boot'
curl -fsS https://api-sso.timeh.my.id/ready | jq '.checks.queue'
```

## Retention Policy

Recommended minimum:

```text
hourly: 24 copies
daily: 14 copies
weekly: 8 copies
monthly: 6 copies
```

Offload encrypted copies outside the VPS for real disaster recovery.

## Evidence Pack

For every backup/restore drill, capture:

```text
backup_dir
SHA256SUMS verification output
pg_restore --list output
restore rehearsal compose ps
/up and /ready outputs
public smoke output
operator name and timestamp
```

Store evidence in a private operational location. Do not commit secrets or dumps
to Git.
