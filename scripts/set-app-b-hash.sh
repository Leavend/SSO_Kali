#!/usr/bin/env bash
# =======================================================
# set-app-b-hash.sh — Generate + set APP_B_CLIENT_SECRET_HASH
# Usage: ./set-app-b-hash.sh [plaintext_secret]
#   Default plaintext: prototype-secret
# =======================================================
set -euo pipefail

PLAINTEXT="${1:-prototype-secret}"
PROJECT_DIR="/opt/sso-prototype-dev"

echo "=== Generating Argon2id hash for App-B client secret ==="
echo "   Memory: 19456 KiB | Time: 3 | Threads: 1"

HASH=$(sudo docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  exec -T sso-backend php -r "echo password_hash('${PLAINTEXT}', PASSWORD_ARGON2ID, ['memory_cost'=>19456,'time_cost'=>3,'threads'=>1]);")

if [ -z "$HASH" ]; then
  echo "❌ ERROR: Hash generation returned empty string"
  exit 1
fi

echo "   Generated: $HASH"

# Backup .env.dev
BACKUP="$PROJECT_DIR/.env.dev.bak.$(date +%s)"
sudo cp "$PROJECT_DIR/.env.dev" "$BACKUP"
echo "   Backup: $BACKUP"

# Remove old entry, add new one using printf to handle $ signs
sudo sed -i '/^APP_B_CLIENT_SECRET_HASH=/d' "$PROJECT_DIR/.env.dev"
printf 'APP_B_CLIENT_SECRET_HASH=%s\n' "$HASH" | sudo tee -a "$PROJECT_DIR/.env.dev" > /dev/null

echo ""
echo "=== Verifying ==="
grep APP_B_CLIENT_SECRET_HASH "$PROJECT_DIR/.env.dev"

echo ""
echo "=== Restarting sso-backend ==="
sudo docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  restart sso-backend

sleep 5
echo ""
echo "=== sso-backend status ==="
sudo docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  ps sso-backend 2>/dev/null || echo "(status check skipped)"

echo ""
echo "✅ APP_B_CLIENT_SECRET_HASH updated successfully"
