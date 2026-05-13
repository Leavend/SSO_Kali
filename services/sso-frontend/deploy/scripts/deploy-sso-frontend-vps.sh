#!/bin/bash
#
# deploy-sso-frontend-vps.sh — Build & Deploy SSO Frontend directly on VPS
#
# Strategy: rsync source to VPS → docker build on VPS → deploy container
#
# Usage:
#   ./deploy/scripts/deploy-sso-frontend-vps.sh
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
IMAGE_TAG="prod"
CONTAINER_NAME="sso-frontend-prod"
CONTAINER_PORT="3080"

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_DIR="${PROJECT_ROOT}"

echo "═══════════════════════════════════════════════════════════════"
echo "  SSO Frontend Deploy → ${DOMAIN}"
echo "  Strategy: rsync + build on VPS"
echo "═══════════════════════════════════════════════════════════════"

# ─── Step 1: Rsync source to VPS ──────────────────────────────────
echo ""
echo "▶ Step 1: Syncing source to VPS..."
sshpass -p "${VPS_PASS}" ssh "${VPS_USER}@${VPS_HOST}" "sudo mkdir -p ${DEPLOY_DIR}/src && sudo chown -R ${VPS_USER}:${VPS_USER} ${DEPLOY_DIR}"

sshpass -p "${VPS_PASS}" rsync -az --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='coverage' \
  "${SRC_DIR}/services/sso-frontend/" \
  "${VPS_USER}@${VPS_HOST}:${DEPLOY_DIR}/src/services/sso-frontend/"

echo "✅ Source synced"

# ─── Step 2: Build & Deploy on VPS ────────────────────────────────
echo ""
echo "▶ Step 2: Building Docker image on VPS..."
sshpass -p "${VPS_PASS}" ssh "${VPS_USER}@${VPS_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail

DEPLOY_DIR="/opt/sso-frontend-prod"
IMAGE_NAME="sso-frontend"
IMAGE_TAG="prod"
CONTAINER_NAME="sso-frontend-prod"
CONTAINER_PORT="3080"
DOMAIN="sso.timeh.my.id"
BACKEND_API="https://api-sso.timeh.my.id"

cd "\${DEPLOY_DIR}/src"

echo "   Building image..."
docker build \
  -f services/sso-frontend/Dockerfile \
  --build-arg VITE_SSO_API_URL="" \
  --build-arg VITE_APP_NAME="Dev-SSO Portal" \
  --build-arg VITE_OIDC_ISSUER="\${BACKEND_API}" \
  --build-arg VITE_OIDC_CLIENT_ID="sso-frontend-portal" \
  --build-arg VITE_OIDC_SCOPE="openid profile email offline_access" \
  --build-arg VITE_OIDC_REDIRECT_URI="https://\${DOMAIN}/auth/callback" \
  --build-arg VITE_OIDC_AUTHORIZE_ENDPOINT="\${BACKEND_API}/oauth2/authorize" \
  --build-arg VITE_OIDC_TOKEN_ENDPOINT="\${BACKEND_API}/oauth2/token" \
  --build-arg VITE_OIDC_END_SESSION_ENDPOINT="\${BACKEND_API}/oauth2/logout" \
  --build-arg VITE_OIDC_POST_LOGOUT_REDIRECT_URI="https://\${DOMAIN}/" \
  -t "\${IMAGE_NAME}:\${IMAGE_TAG}" \
  .

echo "   ✅ Image built"

# Stop old container
if docker ps -a --format '{{.Names}}' | grep -q "^\${CONTAINER_NAME}\$"; then
  echo "   Stopping old container..."
  docker stop "\${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "\${CONTAINER_NAME}" 2>/dev/null || true
fi

# Run new container
echo "   Starting new container..."
docker run -d \
  --name "\${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "127.0.0.1:\${CONTAINER_PORT}:80" \
  -e SSO_BACKEND_UPSTREAM="127.0.0.1:8200" \
  -e SSO_FRONTEND_SERVER_NAME="_" \
  -e SSO_CSP_CONNECT_SRC="https://api-sso.timeh.my.id" \
  --health-cmd="wget -qO- http://localhost/healthz >/dev/null || exit 1" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  --memory=128m \
  --cpus=0.15 \
  "\${IMAGE_NAME}:\${IMAGE_TAG}"

# Wait for healthy
echo "   Waiting for container to be healthy..."
for i in \$(seq 1 20); do
  STATUS=\$(docker inspect --format='{{.State.Health.Status}}' "\${CONTAINER_NAME}" 2>/dev/null || echo "starting")
  if [ "\$STATUS" = "healthy" ]; then
    echo "   ✅ Container healthy!"
    break
  fi
  if [ \$i -eq 20 ]; then
    echo "   ⚠️  Container not healthy yet, checking logs..."
    docker logs --tail 10 "\${CONTAINER_NAME}"
  fi
  sleep 3
done

docker ps --filter "name=\${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
REMOTE_SCRIPT

echo "✅ Container deployed"

# ─── Step 3: Setup Nginx + SSL ─────────────────────────────────────
echo ""
echo "▶ Step 3: Configuring Nginx for ${DOMAIN}..."
sshpass -p "${VPS_PASS}" ssh "${VPS_USER}@${VPS_HOST}" bash -s <<'NGINX_SCRIPT'
set -euo pipefail

DOMAIN="sso.timeh.my.id"
CONF="/etc/nginx/sites-available/${DOMAIN}.conf"
ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"

if [ -f "${ENABLED}" ]; then
  echo "   Nginx config already exists — reloading..."
  sudo nginx -t && sudo systemctl reload nginx
  echo "   ✅ Nginx reloaded"
else
  echo "   Creating Nginx config..."
  
  # First create HTTP-only config for certbot
  sudo tee "${CONF}" > /dev/null <<'NGINX_HTTP'
server {
    listen 80;
    listen [::]:80;
    server_name sso.timeh.my.id;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_HTTP

  sudo ln -sf "${CONF}" "${ENABLED}"
  sudo nginx -t && sudo systemctl reload nginx
  echo "   ✅ HTTP config active"

  # Get SSL cert
  echo "   Obtaining SSL certificate..."
  sudo certbot certonly --webroot -w /var/www/html -d sso.timeh.my.id \
    --non-interactive --agree-tos --email admin@timeh.my.id 2>&1 || {
    echo "   ⚠️  Certbot webroot failed, trying nginx plugin..."
    sudo certbot certonly --nginx -d sso.timeh.my.id \
      --non-interactive --agree-tos --email admin@timeh.my.id 2>&1 || {
      echo "   ❌ SSL failed. Site available on HTTP only."
      exit 0
    }
  }

  # Upgrade to HTTPS config
  echo "   Upgrading to HTTPS config..."
  sudo tee "${CONF}" > /dev/null <<'NGINX_FULL'
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
NGINX_FULL

  sudo nginx -t && sudo systemctl reload nginx
  echo "   ✅ HTTPS config active with SSL"
fi
NGINX_SCRIPT

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOY COMPLETE"
echo ""
echo "  Portal:  https://${DOMAIN}"
echo "  Backend: ${BACKEND_API}"
echo "  Health:  https://${DOMAIN}/healthz"
echo "═══════════════════════════════════════════════════════════════"
