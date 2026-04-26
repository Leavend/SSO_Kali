#!/usr/bin/env bash
# =======================================================
# set-app-b-hash.sh — Generate + set APP_B_CLIENT_SECRET_HASH
# Usage: ./set-app-b-hash.sh [plaintext_secret]
#   Default plaintext: prototype-secret
# =======================================================
set -euo pipefail

PLAINTEXT="${1:-prototype-secret}"
PROJECT_DIR="/opt/sso-prototype-dev"
HASH_TMP="/tmp/_argon2id_hash.txt"
WRITER_TMP="/tmp/_write_hash.sh"

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

# Write hash to a known temp file (no dollar-sign expansion issues with printf)
printf '%s' "$HASH" > "$HASH_TMP"

# Create a writer script with hardcoded paths that sudo can run
cat > "$WRITER_TMP" <<'WRITER'
#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="/opt/sso-prototype-dev"
HASH_TMP="/tmp/_argon2id_hash.txt"

HASH=$(cat "$HASH_TMP")

# Backup
cp "$PROJECT_DIR/.env.dev" "$PROJECT_DIR/.env.dev.bak.$(date +%s)"
echo "   Backup created"

# Remove old entry, write new one
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

# Cleanup
rm -f "$HASH_TMP"
WRITER

chmod +x "$WRITER_TMP"

# Execute with sudo bash — matching the pattern used by the CD pipeline
sudo bash "$WRITER_TMP"

# Cleanup writer
rm -f "$WRITER_TMP"

echo ""
echo "✅ APP_B_CLIENT_SECRET_HASH updated successfully"
