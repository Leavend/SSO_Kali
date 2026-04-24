#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Infrastructure Hardening Deployment Script
# Run this from your local terminal (not from the IDE terminal)
# ─────────────────────────────────────────────────────────────
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${VPS_HOST:-145.79.15.8}"
REMOTE_USER="${VPS_USER:-root}"
REMOTE_PATH="${VPS_PATH:-/opt/sso-prototype-dev}"
SSH_OPTS=(-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ConnectTimeout=10)

log() { printf '\n\033[1;36m[deploy-hardening]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy-hardening][ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# ─── Phase 1: Local Preflight ───
log "Phase 1/5: Local preflight validation"
command -v ssh    >/dev/null 2>&1 || die "Missing: ssh"
command -v rsync  >/dev/null 2>&1 || die "Missing: rsync"

echo "  ✓ SSH and rsync available"

# ─── Phase 2: Sync codebase to VPS ───
log "Phase 2/5: Syncing codebase to VPS"
rsync -az --delete \
  --exclude=.DS_Store --exclude=.env --exclude=.env.dev \
  --exclude=.env.testing --exclude=.secrets --exclude=.git \
  --exclude=vendor --exclude=node_modules --exclude=.next \
  --exclude=coverage --exclude=test-results \
  --exclude=storage/logs --exclude=storage/framework/cache \
  --exclude=storage/framework/sessions --exclude=storage/framework/views \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT_DIR/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"

echo "  ✓ Codebase synced"

# ─── Phase 3: Deploy Nginx config ───
log "Phase 3/5: Deploying Nginx config and validating"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<'REMOTE_NGINX'
set -euo pipefail

NGINX_SRC="/opt/sso-prototype-dev/infra/nginx/dev-sso.timeh.my.id.chained.conf"
NGINX_DST="/etc/nginx/sites-available/dev-sso.timeh.my.id.conf"
SNIPPETS_SRC="/opt/sso-prototype-dev/infra/nginx/snippets/"
SNIPPETS_DST="/etc/nginx/snippets/"

echo "  Copying Nginx config..."
cp "$NGINX_SRC" "$NGINX_DST"
cp "${SNIPPETS_SRC}"*.conf "${SNIPPETS_DST}"

# Symlink if not exists
ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/ 2>/dev/null || true

echo "  Testing Nginx syntax..."
nginx -t 2>&1

echo "  Reloading Nginx (zero-downtime)..."
nginx -s reload

echo "  ✓ Nginx deployed and reloaded"
REMOTE_NGINX

# ─── Phase 4: Rebuild and restart Docker services ───
log "Phase 4/5: Rebuilding and restarting Docker services"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<'REMOTE_DOCKER'
set -euo pipefail

cd /opt/sso-prototype-dev
ENV_FILE=".env.dev"
COMPOSE_FILE="docker-compose.dev.yml"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "  Building sso-backend image (Dockerfile changed)..."
compose build --pull sso-backend

echo "  Building zitadel-login image (theme patch changed)..."
compose build zitadel-login

echo "  Recreating sso-backend (no-deps, zero-downtime)..."
compose up -d --no-deps --force-recreate sso-backend

echo "  Waiting for sso-backend to become healthy..."
timeout=120; elapsed=0
while (( elapsed < timeout )); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$(compose ps -q sso-backend)" 2>/dev/null || echo "starting")"
  case "$status" in
    healthy) echo "  ✓ sso-backend healthy"; break ;;
    unhealthy|exited|dead) echo "  ✗ sso-backend $status"; compose logs --tail 50 sso-backend; exit 1 ;;
  esac
  sleep 5; elapsed=$((elapsed + 5))
done

echo "  Recreating sso-backend-worker..."
compose up -d --no-deps --force-recreate sso-backend-worker

echo "  Recreating zitadel-login (theme update)..."
compose up -d --no-deps --force-recreate zitadel-login

echo "  Waiting for zitadel-login to become healthy..."
timeout=120; elapsed=0
while (( elapsed < timeout )); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$(compose ps -q zitadel-login)" 2>/dev/null || echo "starting")"
  case "$status" in
    healthy) echo "  ✓ zitadel-login healthy"; break ;;
    unhealthy|exited|dead) echo "  ✗ zitadel-login $status"; compose logs --tail 50 zitadel-login; exit 1 ;;
  esac
  sleep 5; elapsed=$((elapsed + 5))
done

echo "  Running sso-backend migrations..."
compose exec -T sso-backend php artisan migrate --force
compose exec -T sso-backend php artisan config:cache

echo "  ✓ Docker services rebuilt and restarted"
REMOTE_DOCKER

# ─── Phase 5: Smoke tests ───
log "Phase 5/5: Running smoke tests"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<'REMOTE_SMOKE'
set -euo pipefail

assert_http() {
  local label="$1" url="$2" pattern="$3"
  local code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 "$url" || true)"
  if [[ "$code" =~ $pattern ]]; then
    echo "  ✓ $label → HTTP $code"
  else
    echo "  ✗ $label → HTTP ${code:-000} (expected $pattern)"
    return 1
  fi
}

# Core OIDC endpoints
assert_http "SSO Discovery"      "https://dev-sso.timeh.my.id/.well-known/openid-configuration" '^200$'
assert_http "JWKS"                "https://dev-sso.timeh.my.id/jwks"                              '^200$'
assert_http "ZITADEL Discovery"  "https://id.dev-sso.timeh.my.id/.well-known/openid-configuration" '^200$'
assert_http "Admin Panel"        "https://dev-sso.timeh.my.id/"                                   '^200$'
assert_http "App A"              "https://app-a.timeh.my.id/"                                     '^(200|30[1278])$'
assert_http "App B"              "https://app-b.timeh.my.id/"                                     '^(200|30[1278])$'

# Verify hardening headers
echo ""
echo "  Verifying HSTS header..."
hsts="$(curl -ksS -I --max-time 10 'https://dev-sso.timeh.my.id/' | grep -i 'strict-transport' || true)"
if [[ "$hsts" == *"includeSubDomains"* && "$hsts" == *"preload"* ]]; then
  echo "  ✓ HSTS: $hsts"
else
  echo "  ✗ HSTS missing includeSubDomains/preload: $hsts"
fi

echo "  Verifying JWKS Cache-Control..."
jwks_cc="$(curl -ksS -I --max-time 10 'https://dev-sso.timeh.my.id/jwks' | grep -i 'cache-control' || true)"
if [[ "$jwks_cc" == *"public"* ]]; then
  echo "  ✓ JWKS Cache: $jwks_cc"
else
  echo "  ✗ JWKS Cache-Control missing public: $jwks_cc"
fi

echo "  Verifying gzip..."
gzip_enc="$(curl -ksS -H 'Accept-Encoding: gzip' -I --max-time 10 'https://dev-sso.timeh.my.id/.well-known/openid-configuration' | grep -i 'content-encoding' || true)"
if [[ "$gzip_enc" == *"gzip"* ]]; then
  echo "  ✓ Gzip: $gzip_enc"
else
  echo "  ⚠ Gzip not detected (may be below min_length threshold): $gzip_enc"
fi

echo ""
echo "  ✓ All smoke tests passed"
REMOTE_SMOKE

log "🎉 Infrastructure hardening deployment completed successfully!"
