#!/usr/bin/env bash
# =======================================================
# set-app-b-hash.sh — Generate + set APP_B_CLIENT_SECRET_HASH
# Usage: ./set-app-b-hash.sh [plaintext_secret]
#   Default plaintext: current APP_B_CLIENT_SECRET from .env.dev
# =======================================================
set -euo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
ENV_FILE="$PROJECT_DIR/.env.dev"
HASH_TMP="/tmp/_argon2id_hash.txt"
WRITER_TMP="/tmp/_write_hash.sh"

env_value() {
  local key="$1"
  awk -v key="$key" '
    /^[[:space:]]*#/ || $0 !~ /=/ { next }
    {
      candidate = $0
      sub(/=.*/, "", candidate)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
      if (candidate == key) {
        sub(/^[^=]*=/, "", $0)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        gsub(/^'\''|'\''$/, "", $0)
        gsub(/^"|"$/, "", $0)
        print $0
        exit
      }
    }
  ' "$ENV_FILE"
}

PLAINTEXT="${1:-$(env_value APP_B_CLIENT_SECRET)}"

if [ -z "$PLAINTEXT" ]; then
  echo "❌ ERROR: APP_B_CLIENT_SECRET must be set or passed as an argument"
  exit 1
fi

echo "=== Generating Argon2id hash for App-B client secret ==="
echo "   Memory: 19456 KiB | Time: 3 | Threads: 1"

HASH=$(sudo docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  exec -T \
  -e APP_B_PLAINTEXT_SECRET="$PLAINTEXT" \
  sso-backend php -r 'echo password_hash((string) getenv("APP_B_PLAINTEXT_SECRET"), PASSWORD_ARGON2ID, ["memory_cost"=>19456,"time_cost"=>3,"threads"=>1]);')

if [ -z "$HASH" ]; then
  echo "❌ ERROR: Hash generation returned empty string"
  exit 1
fi

case "$HASH" in
  '$argon2id$'*) ;;
  *) echo "❌ ERROR: Generated hash is not Argon2id"; exit 1 ;;
esac

# Write hash to a known temp file (no dollar-sign expansion issues with printf)
printf '%s' "$HASH" > "$HASH_TMP"

# Create a writer script with hardcoded paths that sudo can run
cat > "$WRITER_TMP" <<'WRITER'
#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="/opt/sso-prototype-dev"
HASH_TMP="/tmp/_argon2id_hash.txt"

HASH=$(cat "$HASH_TMP")

active_image_tag() {
  local cid image
  cid=$(docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
    --env-file "$PROJECT_DIR/.env.dev" ps -q sso-backend | head -n 1 || true)
  image=$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)
  [ -n "$image" ] && [ "${image##*:}" != "$image" ] && printf '%s' "${image##*:}"
}

quote_env_literal() {
  case "$1" in
    *"'"*) echo "ERROR: value contains unsupported single quote" >&2; return 1 ;;
  esac
  printf "'%s'" "$1"
}

# Backup
cp "$PROJECT_DIR/.env.dev" "$PROJECT_DIR/.env.dev.bak.$(date +%s)"
echo "   Backup created"

# Remove old entry, write new one
sed -i '/^APP_B_CLIENT_SECRET_HASH=/d' "$PROJECT_DIR/.env.dev"
printf 'APP_B_CLIENT_SECRET_HASH=%s\n' "$(quote_env_literal "$HASH")" >> "$PROJECT_DIR/.env.dev"

echo ""
echo "=== Verifying ==="
if grep -Eq "^APP_B_CLIENT_SECRET_HASH='\\\$argon2id\\\$" "$PROJECT_DIR/.env.dev"; then
  echo "   APP_B_CLIENT_SECRET_HASH stored as quoted Argon2id literal"
else
  echo "❌ ERROR: APP_B_CLIENT_SECRET_HASH was not stored safely"
  exit 1
fi

echo ""
echo "=== Restarting SSO backend services ==="
APP_IMAGE_TAG="${APP_IMAGE_TAG:-$(active_image_tag)}"
APP_IMAGE_TAG="${APP_IMAGE_TAG:-local}" docker compose -f "$PROJECT_DIR/docker-compose.dev.yml" \
  --env-file "$PROJECT_DIR/.env.dev" \
  up -d --no-deps sso-backend sso-backend-worker

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
