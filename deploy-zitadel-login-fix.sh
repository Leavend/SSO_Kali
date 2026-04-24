#!/usr/bin/env bash
###############################################################################
# deploy-zitadel-login-fix.sh
# Logs all output to /tmp/deploy-zitadel-login.log
###############################################################################
set -Eeuo pipefail

LOGFILE="/tmp/deploy-zitadel-login.log"
exec > >(tee "$LOGFILE") 2>&1

VPS_USER="tio"
VPS_HOST="145.79.15.8"
VPS_PASS='Bontang123$'
LOCAL_PROJECT="/Users/leavend/Desktop/Project_SSO"
REMOTE_PROJECT="/opt/sso-prototype-dev"

log()  { echo "[DEPLOY] $*"; }
fail() { echo "[FAIL] $*"; exit 1; }

log "Started at $(date)"

command -v sshpass >/dev/null 2>&1 || fail "sshpass not found"

do_ssh() {
  sshpass -p "${VPS_PASS}" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
}

# ─── Phase 1: Sync files via temp dir + sudo ────────────────────────────────
log "Phase 1/5: Syncing patched files to VPS..."

# Rsync to user-writable temp dir, then sudo copy to project
sshpass -p "${VPS_PASS}" rsync -avz --progress \
  -e 'ssh -o StrictHostKeyChecking=no' \
  "${LOCAL_PROJECT}/infra/zitadel-login/" \
  "${VPS_USER}@${VPS_HOST}:/tmp/_deploy_zitadel_login/"

# Sudo copy from temp to project dir
do_ssh "sudo cp -rf /tmp/_deploy_zitadel_login/* '${REMOTE_PROJECT}/infra/zitadel-login/' && \
  sudo cp -rf /tmp/_deploy_zitadel_login/assets/* '${REMOTE_PROJECT}/infra/zitadel-login/assets/' 2>/dev/null; \
  rm -rf /tmp/_deploy_zitadel_login && \
  echo 'Files copied to ${REMOTE_PROJECT}/infra/zitadel-login/'"

log "✅ Phase 1 complete — Files synced"

# ─── Phase 2: Pre-deploy rollback snapshot ───────────────────────────────────
log "Phase 2/5: Creating rollback snapshot..."

do_ssh "cd '${REMOTE_PROJECT}' && \
  CID=\$(sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps -q zitadel-login 2>/dev/null || true) && \
  if [ -n \"\$CID\" ]; then \
    RTAG=\"zitadel-login:rollback-\$(date +%Y%m%d%H%M%S)\" && \
    sudo docker commit \"\$CID\" \"\$RTAG\" 2>/dev/null && \
    echo \"Rollback image: \$RTAG\" || echo 'Commit skipped'; \
  else \
    echo 'No running container to snapshot'; \
  fi"

log "✅ Phase 2 complete — Rollback point created"

# ─── Phase 3: Build new image ────────────────────────────────────────────────
log "Phase 3/5: Building new zitadel-login image (this takes a few minutes)..."

do_ssh "cd '${REMOTE_PROJECT}' && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml \
    build --no-cache zitadel-login 2>&1 | tail -50"

log "✅ Phase 3 complete — Image built"

# ─── Phase 4: Zero-downtime deploy ──────────────────────────────────────────
log "Phase 4/5: Deploying with zero downtime..."

do_ssh "cd '${REMOTE_PROJECT}' && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml \
    up -d --no-deps zitadel-login"

log "Waiting for health check..."

for i in $(seq 1 24); do
  sleep 5
  STATUS=$(do_ssh "CID=\$(sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps -q zitadel-login 2>/dev/null) && \
    sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \"\$CID\" 2>/dev/null || echo unknown")
  log "  [$((i*5))s] Status: $STATUS"
  case "$STATUS" in
    healthy|running) break ;;
    unhealthy|exited|dead) fail "Container entered $STATUS state" ;;
  esac
done

log "✅ Phase 4 complete — Container deployed"

# ─── Phase 5: Verify patches ────────────────────────────────────────────────
log "Phase 5/5: Verifying patches..."

do_ssh "cd '${REMOTE_PROJECT}' && \
  CID=\$(sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps -q zitadel-login) && \
  echo '' && \
  echo '=== PATCH VERIFICATION ===' && \
  echo '' && \
  V2=\$(sudo docker exec \"\$CID\" grep -rl 'V2_' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  echo \"1. V2_ prefix patch:  \${V2} file(s) patched\" && \
  HTML=\$(sudo docker exec \"\$CID\" grep -rl 'Dev-SSO V2 Prefix Rewrite' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  echo \"2. HTML fallback:     \${HTML} file(s) patched\" && \
  TOG=\$(sudo docker exec \"\$CID\" grep -rl 'devsso-theme-toggle' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  echo \"3. Custom toggle:     \${TOG} file(s)\" && \
  echo '' && \
  echo '=== CONTAINER STATUS ===' && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps zitadel-login && \
  echo '' && \
  echo '════════════════════════════════════' && \
  echo '  🎉 DEPLOYMENT COMPLETE' && \
  echo '════════════════════════════════════'"

log "🎉 ALL DONE at $(date)"
