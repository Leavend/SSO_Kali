#!/bin/bash
#
# deploy-sso-frontend.sh — Deploy SSO Frontend to VPS
#
# Usage:
#   ./deploy/scripts/deploy-sso-frontend.sh
#
# Prerequisites:
#   - Docker installed locally
#   - sshpass installed (brew install sshpass)
#   - VPS accessible at 145.79.15.8
#

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────
VPS_HOST="145.79.15.8"
VPS_USER="tio"
VPS_PASS="Bontang123\$"
DEPLOY_DIR="/opt/sso-frontend-prod"
DOMAIN="sso.timeh.my.id"
BACKEND_API="https://api-sso.timeh.my.id"
IMAGE_NAME="sso-frontend"
IMAGE_TAG="latest"
CONTAINER_NAME="sso-frontend-prod"
CONTAINER_PORT="3080"  # Internal port mapped from container:80

# ─── Build Args ────────────────────────────────────────────────────
VITE_SSO_API_URL=""  # Empty = relative (proxied via nginx)
VITE_APP_NAME="Dev-SSO Portal"
VITE_OIDC_ISSUER="${BACKEND_API}"
VITE_OIDC_CLIENT_ID="sso-frontend-portal"
VITE_OIDC_SCOPE="openid profile email offline_access"
VITE_OIDC_REDIRECT_URI="https://${DOMAIN}/auth/callback"
VITE_OIDC_AUTHORIZE_ENDPOINT="${BACKEND_API}/oauth2/authorize"
VITE_OIDC_TOKEN_ENDPOINT="${BACKEND_API}/oauth2/token"
VITE_OIDC_END_SESSION_ENDPOINT="${BACKEND_API}/oauth2/logout"
VITE_OIDC_POST_LOGOUT_REDIRECT_URI="https://${DOMAIN}/"

echo "═══════════════════════════════════════════════════════════════"
echo "  SSO Frontend Deploy → ${DOMAIN}"
echo "═══════════════════════════════════════════════════════════════"

# ─── Step 1: Build Docker Image ────────────────────────────────────
echo ""
echo "▶ Step 1: Building Docker image..."
docker build \
  --platform linux/amd64 \
  -f services/sso-frontend/Dockerfile \
  --build-arg VITE_SSO_API_URL="${VITE_SSO_API_URL}" \
  --build-arg VITE_APP_NAME="${VITE_APP_NAME}" \
  --build-arg VITE_OIDC_ISSUER="${VITE_OIDC_ISSUER}" \
  --build-arg VITE_OIDC_CLIENT_ID="${VITE_OIDC_CLIENT_ID}" \
  --build-arg VITE_OIDC_SCOPE="${VITE_OIDC_SCOPE}" \
  --build-arg VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI}" \
  --build-arg VITE_OIDC_AUTHORIZE_ENDPOINT="${VITE_OIDC_AUTHORIZE_ENDPOINT}" \
  --build-arg VITE_OIDC_TOKEN_ENDPOINT="${VITE_OIDC_TOKEN_ENDPOINT}" \
  --build-arg VITE_OIDC_END_SESSION_ENDPOINT="${VITE_OIDC_END_SESSION_ENDPOINT}" \
  --build-arg VITE_OIDC_POST_LOGOUT_REDIRECT_URI="${VITE_OIDC_POST_LOGOUT_REDIRECT_URI}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  .

echo "✅ Image built: ${IMAGE_NAME}:${IMAGE_TAG}"

# ─── Step 2: Save & Transfer Image ────────────────────────────────
echo ""
echo "▶ Step 2: Saving and transferring image to VPS..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > /tmp/sso-frontend.tar.gz
echo "   Image size: $(du -h /tmp/sso-frontend.tar.gz | cut -f1)"

sshpass -p "${VPS_PASS}" scp /tmp/sso-frontend.tar.gz "${VPS_USER}@${VPS_HOST}:/tmp/sso-frontend.tar.gz"
echo "✅ Image transferred"

# ─── Step 3: Load Image & Deploy on VPS ───────────────────────────
echo ""
echo "▶ Step 3: Loading image and deploying on VPS..."
sshpass -p "${VPS_PASS}" ssh "${VPS_USER}@${VPS_HOST}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

DEPLOY_DIR="/opt/sso-frontend-prod"
CONTAINER_NAME="sso-frontend-prod"
CONTAINER_PORT="3080"
IMAGE_NAME="sso-frontend"
IMAGE_TAG="latest"

# Load image
echo "   Loading Docker image..."
docker load < /tmp/sso-frontend.tar.gz
rm -f /tmp/sso-frontend.tar.gz

# Create deploy dir
sudo mkdir -p "${DEPLOY_DIR}"

# Stop old container if exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "   Stopping old container..."
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}" 2>/dev/null || true
fi

# Run new container
echo "   Starting new container..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "127.0.0.1:${CONTAINER_PORT}:80" \
  -e SSO_BACKEND_UPSTREAM="127.0.0.1:8200" \
  -e SSO_FRONTEND_SERVER_NAME="_" \
  -e SSO_CSP_CONNECT_SRC="https://api-sso.timeh.my.id" \
  --health-cmd="wget -qO- http://localhost/healthz >/dev/null || exit 1" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  --memory=128m \
  --cpus=0.15 \
  "${IMAGE_NAME}:${IMAGE_TAG}"

# Wait for healthy
echo "   Waiting for container to be healthy..."
for i in $(seq 1 15); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "   ✅ Container healthy!"
    break
  fi
  sleep 2
done

docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
REMOTE_SCRIPT

echo "✅ Container deployed"

# ─── Step 4: Setup Nginx (if not exists) ──────────────────────────
echo ""
echo "▶ Step 4: Configuring Nginx for ${DOMAIN}..."
sshpass -p "${VPS_PASS}" ssh "${VPS_USER}@${VPS_HOST}" bash -s <<'NGINX_SCRIPT'
set -euo pipefail

DOMAIN="sso.timeh.my.id"
CONF="/etc/nginx/sites-available/${DOMAIN}.conf"
ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"

if [ -f "${ENABLED}" ]; then
  echo "   Nginx config already exists, skipping..."
else
  echo "   Creating Nginx config..."
  sudo tee "${CONF}" > /dev/null <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name sso.timeh.my.id;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sso.timeh.my.id;

    ssl_certificate     /etc/letsencrypt/live/sso.timeh.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sso.timeh.my.id/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # ─── Security Headers ──────────────────────────────────────
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api-sso.timeh.my.id; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://api-sso.timeh.my.id" always;

    # ─── Gzip ──────────────────────────────────────────────────
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
    gzip_vary on;

    # ─── Static assets (long cache) ───────────────────────────
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3080;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        access_log off;
    }

    # ─── Health check ──────────────────────────────────────────
    location = /healthz {
        proxy_pass http://127.0.0.1:3080;
        access_log off;
    }

    # ─── SPA fallback ──────────────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONF

  sudo ln -sf "${CONF}" "${ENABLED}"
  echo "   ✅ Nginx config created and enabled"

  # Get SSL cert
  echo "   Obtaining SSL certificate..."
  sudo certbot certonly --nginx -d sso.timeh.my.id --non-interactive --agree-tos --email admin@timeh.my.id || {
    echo "   ⚠️  Certbot failed — trying webroot method..."
    sudo certbot certonly --webroot -w /var/www/html -d sso.timeh.my.id --non-interactive --agree-tos --email admin@timeh.my.id || {
      echo "   ❌ SSL cert failed. Deploy HTTP-only first, fix cert manually."
    }
  }

  # Test and reload
  sudo nginx -t && sudo systemctl reload nginx
  echo "   ✅ Nginx reloaded"
fi
NGINX_SCRIPT

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOY COMPLETE"
echo "  Portal: https://${DOMAIN}"
echo "  Backend: ${BACKEND_API}"
echo "═══════════════════════════════════════════════════════════════"

# Cleanup
rm -f /tmp/sso-frontend.tar.gz
