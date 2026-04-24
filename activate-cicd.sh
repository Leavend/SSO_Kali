#!/usr/bin/env bash
###############################################################################
# activate-cicd.sh
#
# One-time setup script:
# 1. Installs SSH deploy key on VPS
# 2. Syncs pending patch files (zitadel-login fixes)
# 3. Deploys zitadel-login with the fixes
# 4. Prints GitHub Secrets values for copy-paste
###############################################################################
set -Eeuo pipefail

VPS_USER="tio"
VPS_HOST="145.79.15.8"
VPS_PASS='Bontang123$'
LOCAL_PROJECT="/Users/leavend/Desktop/Project_SSO"
REMOTE_PROJECT="/opt/sso-prototype-dev"
DEPLOY_KEY="$LOCAL_PROJECT/.secrets/deploy/github_deploy_key"
DEPLOY_KEY_PUB="$LOCAL_PROJECT/.secrets/deploy/github_deploy_key.pub"

log()  { echo "[SETUP] $*"; }
fail() { echo "[FAIL] $*"; exit 1; }

command -v sshpass >/dev/null 2>&1 || fail "sshpass not found"

do_ssh() {
  sshpass -p "${VPS_PASS}" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
}

# ─── Step 1: Install SSH deploy key on VPS ───────────────────────────────────
log "Step 1/4: Installing SSH deploy key on VPS..."

PUBKEY=$(cat "$DEPLOY_KEY_PUB")
do_ssh "mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
  grep -qF '${PUBKEY}' ~/.ssh/authorized_keys 2>/dev/null || \
  echo '${PUBKEY}' >> ~/.ssh/authorized_keys && \
  chmod 600 ~/.ssh/authorized_keys && \
  echo 'Deploy key installed'"

log "✅ SSH deploy key installed"

# ─── Step 2: Sync files to VPS ───────────────────────────────────────────────
log "Step 2/4: Syncing all project files..."

# Sync infra/zitadel-login patches to VPS temp dir
sshpass -p "${VPS_PASS}" rsync -avz --progress \
  -e 'ssh -o StrictHostKeyChecking=no' \
  "${LOCAL_PROJECT}/infra/zitadel-login/" \
  "${VPS_USER}@${VPS_HOST}:/tmp/_sync_zitadel_login/"

do_ssh "sudo cp -rf /tmp/_sync_zitadel_login/* '${REMOTE_PROJECT}/infra/zitadel-login/' 2>/dev/null; \
  rm -rf /tmp/_sync_zitadel_login"

# Sync CI/CD scripts to VPS temp dir
sshpass -p "${VPS_PASS}" rsync -avz --progress \
  -e 'ssh -o StrictHostKeyChecking=no' \
  "${LOCAL_PROJECT}/scripts/vps-deploy.sh" \
  "${LOCAL_PROJECT}/scripts/vps-rollback.sh" \
  "${VPS_USER}@${VPS_HOST}:/tmp/_sync_scripts/"

do_ssh "sudo mkdir -p '${REMOTE_PROJECT}/scripts' && \
  sudo cp -f /tmp/_sync_scripts/* '${REMOTE_PROJECT}/scripts/' && \
  sudo chmod +x '${REMOTE_PROJECT}/scripts/vps-deploy.sh' '${REMOTE_PROJECT}/scripts/vps-rollback.sh' && \
  rm -rf /tmp/_sync_scripts"

log "✅ Files synced"

# ─── Step 3: Deploy zitadel-login fix ────────────────────────────────────────
log "Step 3/4: Building and deploying zitadel-login fix..."

do_ssh "cd '${REMOTE_PROJECT}' && \
  CID=\$(sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps -q zitadel-login 2>/dev/null || true) && \
  if [ -n \"\$CID\" ]; then \
    RTAG=\"zitadel-login:rollback-\$(date +%Y%m%d%H%M%S)\" && \
    sudo docker commit \"\$CID\" \"\$RTAG\" 2>/dev/null && \
    echo \"Rollback: \$RTAG\"; \
  fi"

log "  Building image (this takes a few minutes)..."
do_ssh "cd '${REMOTE_PROJECT}' && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml \
    build --no-cache zitadel-login 2>&1 | tail -30"

log "  Deploying with zero downtime..."
do_ssh "cd '${REMOTE_PROJECT}' && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml \
    up -d --no-deps zitadel-login"

log "  Waiting for healthcheck..."
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

log "  Verifying patches..."
do_ssh "cd '${REMOTE_PROJECT}' && \
  CID=\$(sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps -q zitadel-login) && \
  V2=\$(sudo docker exec \"\$CID\" grep -rl 'V2_' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  HTML=\$(sudo docker exec \"\$CID\" grep -rl 'Dev-SSO V2 Prefix Rewrite' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  TOG=\$(sudo docker exec \"\$CID\" grep -rl 'devsso-theme-toggle' /app/apps/login/.next/ 2>/dev/null | wc -l) && \
  echo \"V2_ patch: \${V2} files  |  HTML fallback: \${HTML} files  |  Custom toggle: \${TOG} files\" && \
  sudo docker compose --env-file .env.dev -f docker-compose.dev.yml ps zitadel-login"

log "✅ zitadel-login deployed"

# ─── Step 4: Print GitHub Secrets ────────────────────────────────────────────
log "Step 4/4: GitHub Secrets ready for copy-paste"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  🎉 SETUP COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ SSH deploy key installed on VPS"
echo "  ✅ zitadel-login fix deployed (SignedIn redirect + theme toggle)"
echo "  ✅ CI/CD scripts synced"
echo ""
echo "  📋 Add these GitHub Secrets (Settings → Secrets → Actions):"
echo ""
echo "  ┌─────────────────────┬──────────────────────────────────────┐"
echo "  │ Secret Name         │ Value                                │"
echo "  ├─────────────────────┼──────────────────────────────────────┤"
echo "  │ VPS_HOST            │ 145.79.15.8                          │"
echo "  │ VPS_USER            │ tio                                  │"
echo "  │ VPS_PROJECT_DIR     │ /opt/sso-prototype-dev               │"
echo "  │ VPS_SSH_KEY         │ (see below)                          │"
echo "  └─────────────────────┴──────────────────────────────────────┘"
echo ""
echo "  VPS_SSH_KEY value (copy everything between the markers):"
echo "  ─────────────────────────────────────────────────────────"
cat "$DEPLOY_KEY"
echo "  ─────────────────────────────────────────────────────────"
echo ""
echo "  Verify in browser:"
echo "  1. https://dev-sso.timeh.my.id/auth/login → should auto-redirect after login"
echo "  2. Only 1 theme toggle visible (no duplicate)"
echo ""
