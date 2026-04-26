#!/usr/bin/env bash
# ==============================================================================
# vps-login-ui-cutover.sh — ZITADEL Login UI Cutover / Rollback
#
# Switches only the active ZITADEL Login V2 base path. The Vue canary remains
# path-isolated at /ui/v2/login-vue, while hosted login remains the rollback path
# at /ui/v2/login.
#
# Usage:
#   sudo bash vps-login-ui-cutover.sh --mode vue --project-dir /opt/sso-prototype-dev
#   sudo bash vps-login-ui-cutover.sh --mode hosted --project-dir /opt/sso-prototype-dev
# ==============================================================================
set -Eeuo pipefail

MODE=""
PROJECT_DIR="/opt/sso-prototype-dev"
TAG="${APP_IMAGE_TAG:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift ;;
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --tag) TAG="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

[[ "$MODE" =~ ^(vue|hosted)$ ]] || { echo "ERROR: --mode must be vue or hosted"; exit 1; }

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
VUE_PATH="/ui/v2/login-vue"
HOSTED_PATH="/ui/v2/login"
ACTIVE_PATH="$HOSTED_PATH"
[[ "$MODE" == "vue" ]] && ACTIVE_PATH="$VUE_PATH"

log() { printf '\033[0;36m[LOGIN-UI]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[LOGIN-UI][FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

env_value() {
  local key="$1" fallback="${2:-}"
  awk -F= -v key="$key" '$1 == key {print substr($0, length(key) + 2)}' "$ENV_FILE" | tail -n 1 || printf '%s' "$fallback"
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" 'BEGIN{done=0} $0 ~ "^" key "=" {$0=key "=" value; done=1} {print} END{if(!done) print key "=" value}' "$ENV_FILE" > "$tmp"
  install -m 0644 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

current_tag() {
  local cid image
  cid="$(compose ps -q sso-frontend 2>/dev/null || true)"
  [[ -n "$cid" ]] || return 1
  image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
  printf '%s\n' "${image##*:}"
}

wait_healthy() {
  local svc="$1" timeout="${2:-120}" elapsed=0 cid status
  while [ "$elapsed" -lt "$timeout" ]; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
      case "$status" in healthy|running) log "$svc is $status"; return 0 ;; unhealthy|exited|dead) return 1 ;; esac
    fi
    sleep 3; elapsed=$((elapsed + 3))
  done
  return 1
}

smoke() {
  local label="$1" url="$2" pattern="$3" code
  code="$(curl -LksS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)"
  [[ "$code" =~ $pattern ]] || fail "$label returned HTTP $code"
  log "$label returned HTTP $code"
}

restart_config_services() {
  compose up -d --no-deps sso-frontend zitadel-api
  wait_healthy sso-frontend 150 || fail "sso-frontend did not become healthy"
  wait_healthy zitadel-api 180 || fail "zitadel-api did not become healthy"
}

activate_vue() {
  local secret
  secret="$(env_value ZITADEL_LOGIN_VUE_COOKIE_SECRET)"
  [[ ${#secret} -ge 32 && "$secret" != REPLACE_* ]] || fail "ZITADEL_LOGIN_VUE_COOKIE_SECRET must be a strong deployed secret"
  compose up -d --no-deps zitadel-login-vue
  wait_healthy zitadel-login-vue 150 || fail "zitadel-login-vue did not become healthy"
}

preflight() {
  [[ -f "$COMPOSE_FILE" ]] || fail "Missing Compose file: $COMPOSE_FILE"
  [[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"
  compose config --services | grep -Fxq sso-frontend || fail "Compose missing sso-frontend"
  compose config --services | grep -Fxq zitadel-api || fail "Compose missing zitadel-api"
  [[ "$MODE" == "hosted" ]] || compose config --services | grep -Fxq zitadel-login-vue || fail "Compose missing zitadel-login-vue"
}

TAG="${TAG:-$(current_tag || true)}"
[[ -n "$TAG" ]] || fail "Cannot determine APP_IMAGE_TAG; pass --tag explicitly"
export APP_IMAGE_TAG="$TAG"

cd "$PROJECT_DIR"
preflight

log "Switching active login UI to ${ACTIVE_PATH} with tag ${APP_IMAGE_TAG}"
[[ "$MODE" == "hosted" ]] || activate_vue
set_env_value ZITADEL_LOGIN_ACTIVE_BASE_PATH "$ACTIVE_PATH"
restart_config_services

SSO_DOMAIN="$(env_value SSO_DOMAIN)"
ZITADEL_DOMAIN="$(env_value ZITADEL_DOMAIN)"

smoke "SSO discovery" "https://${SSO_DOMAIN}/.well-known/openid-configuration" "^200$"
smoke "Admin panel" "https://${SSO_DOMAIN}/" "^200$"

if [[ "$MODE" == "vue" ]]; then
  smoke "Vue login canary" "https://${ZITADEL_DOMAIN}${VUE_PATH}/healthz" "^200$"
else
  smoke "Hosted login rollback" "https://${ZITADEL_DOMAIN}${HOSTED_PATH}/healthy" "^200$"
fi

log "Active login UI path is ${ACTIVE_PATH}"
