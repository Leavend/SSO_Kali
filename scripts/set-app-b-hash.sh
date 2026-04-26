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

# Write hash to a temp file to avoid shell expansion of $ signs in argon2id hash
HASH_FILE=$(mktemp)
printf '%s' "$HASH" > "$HASH_FILE"

# Run all write operations in a single sudo session to avoid credential cache expiry
# Pass HASH_FILE and PROJECT_DIR as environment variables to sudo
sudo HASH_FILE="$HASH_FILE" PROJECT_DIR="$PROJECT_DIR" bash <<'SUDO_BLOCK'
set -euo pipefail

HASH=$(cat "$HASH_FILE")

# Backup .env.dev
cp "$PROJECT_DIR/.env.dev" "$PROJECT_DIR/.env.dev.bak.$(date +%s)"
echo "   Backup created"

# Remove old entry, add new one
sed -i '/^APP_B_CLIENT_SECRET_HASH=/d' "$PROJECT_DIR/.env.dev"
printf 'APP_B_CLIENT_SECRET_HASH=%s\n' "$HASH" >> "$PROJECT_DIR/.env.dev"

echo ""
echo "=== Verifying ==="
grep APP_B_CLIENT_SECRET_HASH "$PROJECT_DIR/.env.dev"

echo ""
echo "=== Restarting sso-backend ==="
docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  restart sso-backend

sleep 5
echo ""
echo "=== sso-backend status ==="
docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  ps sso-backend 2>/dev/null || echo "(status check skipped)"
SUDO_BLOCK

# Cleanup
rm -f "$HASH_FILE"

echo ""
echo "✅ APP_B_CLIENT_SECRET_HASH updated successfully"
