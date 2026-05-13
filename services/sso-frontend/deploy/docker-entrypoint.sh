#!/bin/sh
#
# docker-entrypoint.sh — render Nginx template dengan envsubst lalu start server.
#
# Env var wajib:
#   SSO_BACKEND_UPSTREAM       host:port backend Laravel
#   SSO_FRONTEND_SERVER_NAME   domain portal (mis. sso.example.com)
#
# Env var opsional:
#   SSO_CSP_CONNECT_SRC        whitespace-separated origin tambahan untuk connect-src CSP

set -eu

: "${SSO_BACKEND_UPSTREAM:?SSO_BACKEND_UPSTREAM is required (host:port)}"
: "${SSO_FRONTEND_SERVER_NAME:=_}"
: "${SSO_CSP_CONNECT_SRC:=}"

export SSO_BACKEND_UPSTREAM SSO_FRONTEND_SERVER_NAME SSO_CSP_CONNECT_SRC

TEMPLATE="/etc/nginx/templates/sso-frontend.conf.template"
OUTPUT="/etc/nginx/conf.d/default.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 1
fi

envsubst '${SSO_BACKEND_UPSTREAM} ${SSO_FRONTEND_SERVER_NAME} ${SSO_CSP_CONNECT_SRC}' \
  < "$TEMPLATE" > "$OUTPUT"

nginx -t

exec "$@"
