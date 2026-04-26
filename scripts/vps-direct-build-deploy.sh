#!/usr/bin/env bash
# ==============================================================================
# vps-direct-build-deploy.sh — Direct VPS image build and canary deploy
#
# Use only when registry-based CI/CD is not available yet. The script builds
# selected services on the VPS with an immutable local tag, updates them one by
# one with health gates, runs smoke checks, and rolls back touched services when
# a gate fails.
# ==============================================================================
set -Eeuo pipefail

TAG=""
PROJECT_DIR="/opt/sso-prototype-dev"
SERVICES=(sso-frontend sso-admin-vue zitadel-login-vue)
PRUNE_BUILD_CACHE=0
MIN_REPLICAS="${MIN_REPLICAS:-2}"
GREEN_DRAIN_SECONDS="${GREEN_DRAIN_SECONDS:-30}"
GREEN_STOP_GRACE_SECONDS="${GREEN_STOP_GRACE_SECONDS:-20}"
SMOKE_RETRIES="${SMOKE_RETRIES:-5}"
SMOKE_RETRY_SECONDS="${SMOKE_RETRY_SECONDS:-6}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift ;;
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --services)
      IFS=',' read -r -a SERVICES <<<"$2"
      shift
      ;;
    --prune-build-cache) PRUNE_BUILD_CACHE=1 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

[[ -n "$TAG" ]] || { echo "ERROR: --tag required"; exit 1; }
[[ "$MIN_REPLICAS" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: MIN_REPLICAS must be a positive integer"; exit 1; }
[[ "$GREEN_DRAIN_SECONDS" =~ ^[0-9]+$ ]] || { echo "ERROR: GREEN_DRAIN_SECONDS must be a non-negative integer"; exit 1; }
[[ "$GREEN_STOP_GRACE_SECONDS" =~ ^[0-9]+$ ]] || { echo "ERROR: GREEN_STOP_GRACE_SECONDS must be a non-negative integer"; exit 1; }
[[ "$SMOKE_RETRIES" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: SMOKE_RETRIES must be a positive integer"; exit 1; }
[[ "$SMOKE_RETRY_SECONDS" =~ ^[0-9]+$ ]] || { echo "ERROR: SMOKE_RETRY_SECONDS must be a non-negative integer"; exit 1; }

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
DEFAULT_DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-${HOME:-/tmp}}"
DEPLOY_LOG="${DEPLOY_LOG:-$DEFAULT_DEPLOY_LOG_DIR/sso-direct-build-deploy-$(date +%Y%m%d%H%M%S).log}"
ROLLBACK_TAG="rollback-${TAG}"
STATE_DIR="${STATE_DIR:-${HOME:-/tmp}/.cache/sso-direct-deploy}"
DEPLOY_TAG_FILE="${DEPLOY_TAG_FILE:-$STATE_DIR/last-deploy-tag}"
ROLLBACK_TAG_FILE="${ROLLBACK_TAG_FILE:-$STATE_DIR/last-rollback-tag}"
ROLLBACK_STARTED=0
TOUCHED_SERVICES=()
GREEN_CONTAINERS=()

declare -A LOCAL_IMAGE_MAP=(
  [sso-backend]="sso-dev-sso-backend"
  [sso-backend-worker]="sso-dev-sso-backend"
  [sso-frontend]="sso-dev-sso-frontend"
  [sso-admin-vue]="sso-dev-sso-admin-vue"
  [zitadel-login]="sso-dev-zitadel-login"
  [zitadel-login-vue]="sso-dev-zitadel-login-vue"
  [app-a-next]="sso-dev-app-a-next"
  [app-b-laravel]="sso-dev-app-b-laravel"
)

log()  { printf '\033[0;32m[DIRECT-DEPLOY]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; exit 1; }

env_value() {
  local key="$1" default="${2:-}" value
  value=$(
    awk -v key="$key" '
      /^[[:space:]]*#/ || $0 !~ /=/ { next }
      {
        candidate = $0
        sub(/=.*/, "", candidate)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
        if (candidate == key) {
          sub(/^[^=]*=/, "", $0)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
          gsub(/^"|"$/, "", $0)
          print $0
          exit
        }
      }
    ' "$ENV_FILE"
  )
  printf '%s' "${value:-$default}"
}

compose() {
  APP_IMAGE_TAG="$TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

rollback_compose() {
  APP_IMAGE_TAG="$ROLLBACK_TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

desired_scale() {
  case "$1" in
    sso-frontend|sso-admin-vue|zitadel-login|zitadel-login-vue) printf '%s' "$MIN_REPLICAS" ;;
    *) printf '1' ;;
  esac
}

wait_healthy() {
  local svc="$1" timeout="${2:-180}" elapsed=0 desired status cid all_healthy
  local -a cids=()
  desired="$(desired_scale "$svc")"

  while [ "$elapsed" -lt "$timeout" ]; do
    mapfile -t cids < <(compose ps -q "$svc" 2>/dev/null || true)

    if [ "${#cids[@]}" -ge "$desired" ]; then
      all_healthy=1
      for cid in "${cids[@]}"; do
        status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo "unknown")
        case "$status" in
          healthy|running) ;;
          unhealthy|exited|dead)
            warn "  $svc replica $cid entered $status"
            docker logs --tail 40 "$cid" 2>&1 | tee -a "$DEPLOY_LOG" || true
            return 1
            ;;
          *) all_healthy=0 ;;
        esac
      done

      if [ "$all_healthy" -eq 1 ]; then
        log "  $svc has ${#cids[@]} healthy replica(s)"
        return 0
      fi
    fi

    sleep 5
    elapsed=$((elapsed + 5))
    [ $((elapsed % 20)) -eq 0 ] && log "  [${elapsed}s] $svc: waiting for ${desired} healthy replica(s)"
  done

  warn "  $svc timed out after ${timeout}s"
  return 1
}

smoke_status() {
  local label="$1" url="$2" pattern="$3" host="${4:-}" code
  if [ -n "$host" ] && [[ "$url" == https://* ]]; then
    code=$(curl -ksSL --resolve "$host:443:127.0.0.1" -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  elif [ -n "$host" ]; then
    code=$(curl -ksSL -H "Host: $host" -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  else
    code=$(curl -ksSL -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  fi

  if [[ "$code" =~ $pattern ]]; then
    log "  $label: HTTP $code"
    return 0
  fi

  warn "  $label: HTTP $code (expected $pattern)"
  return 1
}

smoke_check() {
  local label="$1" url="$2" pattern="$3" host="${4:-}" attempt

  for attempt in $(seq 1 "$SMOKE_RETRIES"); do
    smoke_status "$label" "$url" "$pattern" "$host" && return 0
    if [ "$attempt" -lt "$SMOKE_RETRIES" ]; then
      warn "  $label: retrying smoke check in ${SMOKE_RETRY_SECONDS}s (${attempt}/${SMOKE_RETRIES})"
      sleep "$SMOKE_RETRY_SECONDS"
    fi
  done

  return 1
}

rollback() {
  cleanup_all_green

  if [ "${#TOUCHED_SERVICES[@]}" -eq 0 ]; then
    warn "Rollback skipped; no runtime services were updated"
    return 0
  fi

  warn "Rollback started for touched services"
  for svc in "${TOUCHED_SERVICES[@]}"; do
    if [ -n "${LOCAL_IMAGE_MAP[$svc]:-}" ] && docker image inspect "${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}" >/dev/null 2>&1; then
      warn "  rolling back $svc to ${ROLLBACK_TAG}"
      rollback_compose up -d --no-deps --scale "$svc=$(desired_scale "$svc")" "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || true
      wait_healthy "$svc" 120 || true
    elif [ "$svc" = "sso-admin-vue" ]; then
      warn "  stopping canary $svc because no previous image exists"
      compose stop "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || true
    fi
  done
}

supports_green_prewarm() {
  case "$1" in
    app-a-next|app-b-laravel|sso-frontend|sso-backend|zitadel-login|zitadel-login-vue) return 0 ;;
    *) return 1 ;;
  esac
}

health_path() {
  case "$1" in
    app-a-next) printf '/healthz' ;;
    app-b-laravel) printf '/health' ;;
    sso-backend) printf '/.well-known/openid-configuration' ;;
    sso-frontend) printf '/healthz' ;;
    zitadel-login) printf '/ui/v2/login/healthy' ;;
    zitadel-login-vue) printf "$(env_value ZITADEL_LOGIN_VUE_BASE_PATH /ui/v2/login-vue)/healthz" ;;
    *) printf '/healthz' ;;
  esac
}

health_port() {
  case "$1" in
    app-b-laravel|sso-backend) printf '8000' ;;
    zitadel-login-vue) printf '3010' ;;
    *) printf '3000' ;;
  esac
}

compose_network_name() {
  local cid="$1"
  docker inspect "$cid" | python3 -c '
import json
import sys

data = json.load(sys.stdin)[0]
networks = data.get("NetworkSettings", {}).get("Networks", {})
for name in networks:
    if name.endswith("_sso-dev") or name == "sso-dev":
        print(name)
        raise SystemExit(0)
print(next(iter(networks), ""))
'
}

write_traefik_labels() {
  local cid="$1" label_file="$2"
  docker inspect "$cid" | python3 -c '
import json
import sys

label_file = sys.argv[1]
labels = json.load(sys.stdin)[0].get("Config", {}).get("Labels", {})
with open(label_file, "w", encoding="utf-8") as handle:
    for key in sorted(labels):
        if key.startswith("traefik."):
            handle.write(f"{key}={labels[key]}\n")
' "$label_file"
}

copy_container_env() {
  local cid="$1" env_file="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" >"$env_file"
}

mount_args_for() {
  local cid="$1"
  docker inspect "$cid" | python3 -c '
import json
import shlex
import sys

mounts = json.load(sys.stdin)[0].get("Mounts", [])
args = []
for mount in mounts:
    mount_type = mount.get("Type")
    target = mount.get("Destination")
    source = mount.get("Name") if mount_type == "volume" else mount.get("Source")
    if not mount_type or not source or not target:
        continue
    option = f"type={mount_type},source={source},target={target}"
    if not mount.get("RW", False):
        option += ",readonly"
    args.extend(["--mount", option])
print("\n".join(shlex.quote(value) for value in args))
'
}

wait_green_healthy() {
  local svc="$1" cid="$2" timeout="${3:-180}" elapsed=0 path port
  path="$(health_path "$svc")"
  port="$(health_port "$svc")"

  while [ "$elapsed" -lt "$timeout" ]; do
    if docker exec "$cid" wget -q -O - "http://127.0.0.1:${port}${path}" >/dev/null 2>&1; then
      return 0
    fi

    status=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
    if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
      warn "  green $svc container $cid exited"
      docker logs --tail 60 "$cid" 2>&1 | tee -a "$DEPLOY_LOG" || true
      return 1
    fi

    sleep 3
    elapsed=$((elapsed + 3))
  done

  warn "  green $svc container $cid timed out after ${timeout}s"
  docker logs --tail 60 "$cid" 2>&1 | tee -a "$DEPLOY_LOG" || true
  return 1
}

cleanup_green_for_service() {
  local svc="$1" kept=() name
  if [ "${#GREEN_CONTAINERS[@]}" -gt 0 ] && [ "$GREEN_DRAIN_SECONDS" -gt 0 ]; then
    log "  draining green $svc replicas for ${GREEN_DRAIN_SECONDS}s before cleanup"
    sleep "$GREEN_DRAIN_SECONDS"
  fi
  for name in "${GREEN_CONTAINERS[@]}"; do
    if [[ "$name" == "sso-green-${svc}-"* ]]; then
      docker stop --time "$GREEN_STOP_GRACE_SECONDS" "$name" >/dev/null 2>&1 || true
      docker rm "$name" >/dev/null 2>&1 || true
    else
      kept+=("$name")
    fi
  done
  GREEN_CONTAINERS=("${kept[@]}")
}

cleanup_all_green() {
  local name
  for name in "${GREEN_CONTAINERS[@]}"; do
    docker rm -f "$name" >/dev/null 2>&1 || true
  done
  GREEN_CONTAINERS=()
}

prewarm_green_replicas() {
  local svc="$1" image="${LOCAL_IMAGE_MAP[$svc]}:${TAG}" desired cid network env_file label_file mounts
  local -a cids=()
  desired="$(desired_scale "$svc")"
  mapfile -t cids < <(compose ps -q "$svc" 2>/dev/null || true)
  cid="${cids[0]:-}"
  [ -n "$cid" ] || return 0

  network="$(compose_network_name "$cid")"
  [ -n "$network" ] || fail "Could not determine Docker network for $svc"

  env_file="$(mktemp "/tmp/sso-${svc}-env.XXXXXX")"
  label_file="$(mktemp "/tmp/sso-${svc}-labels.XXXXXX")"
  copy_container_env "$cid" "$env_file"
  write_traefik_labels "$cid" "$label_file"
  mounts="$(mount_args_for "$cid")"

  log "  prewarming $desired green $svc replica(s) behind Traefik"
  for index in $(seq 1 "$desired"); do
    local green="sso-green-${svc}-${TAG}-${index}"
    docker rm -f "$green" >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    docker run -d \
      --name "$green" \
      --restart unless-stopped \
      --network "$network" \
      --env-file "$env_file" \
      --label-file "$label_file" \
      $mounts \
      "$image" >/dev/null
    GREEN_CONTAINERS+=("$green")
    wait_green_healthy "$svc" "$green" 180 || return 1
  done

  rm -f "$env_file" "$label_file"
  log "  green $svc replicas are healthy; allowing proxy discovery"
  sleep 8
}

build_service_image() {
  local svc="$1" image="${LOCAL_IMAGE_MAP[$svc]}:${TAG}"

  case "$svc" in
    app-a-next)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        "$PROJECT_DIR/apps/app-a-next" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    app-b-laravel)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        "$PROJECT_DIR/apps/app-b-laravel" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    sso-backend)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        "$PROJECT_DIR/services/sso-backend" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    sso-frontend)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        -f "$PROJECT_DIR/services/sso-frontend/Dockerfile" \
        --build-arg "VITE_SSO_BASE_URL=$(env_value SSO_BASE_URL)" \
        --build-arg "VITE_ADMIN_BASE_URL=$(env_value ADMIN_PANEL_BASE_URL)" \
        --build-arg "VITE_CLIENT_ID=$(env_value ADMIN_PANEL_CLIENT_ID sso-admin-panel)" \
        "$PROJECT_DIR" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    sso-admin-vue)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        --build-arg "VITE_ADMIN_BASE_URL=$(env_value ADMIN_PANEL_BASE_URL)" \
        --build-arg "VITE_PUBLIC_BASE_PATH=$(env_value SSO_ADMIN_VUE_BASE_PATH /__vue-preview)" \
        --build-arg "VITE_SSO_BASE_URL=$(env_value SSO_BASE_URL)" \
        --build-arg "VITE_ZITADEL_ISSUER_URL=$(env_value ZITADEL_ISSUER)" \
        "$PROJECT_DIR/services/sso-admin-vue" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    zitadel-login)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        -f "$PROJECT_DIR/infra/zitadel-login/Dockerfile" \
        --build-arg "ZITADEL_VERSION=$(env_value ZITADEL_VERSION v4.14.0)" \
        "$PROJECT_DIR" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    zitadel-login-vue)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        -f "$PROJECT_DIR/services/zitadel-login-vue/Dockerfile" \
        --build-arg "VITE_PUBLIC_BASE_PATH=$(env_value ZITADEL_LOGIN_VUE_BASE_PATH /ui/v2/login-vue)" \
        "$PROJECT_DIR" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    *)
      fail "Direct docker build is not mapped for service: $svc"
      ;;
  esac
}

build_selected_images() {
  local svc
  for svc in "${SERVICES[@]}"; do
    build_service_image "$svc" || return 1
  done
}

rollback_once() {
  local reason="${1:-Deploy failed unexpectedly}"
  if [ "$ROLLBACK_STARTED" -eq 1 ]; then
    return 1
  fi

  ROLLBACK_STARTED=1
  trap - ERR
  warn "$reason"
  rollback
  exit 1
}

trap 'rollback_once "Deploy failed unexpectedly"' ERR

log "Direct VPS deploy tag: $TAG"
log "Project dir: $PROJECT_DIR"
log "Services: ${SERVICES[*]}"

[[ -f "$COMPOSE_FILE" ]] || fail "Missing Compose file: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"
mkdir -p "$STATE_DIR"

cd "$PROJECT_DIR"

required_services="$(compose config --services)"
for svc in "${SERVICES[@]}"; do
  [[ -n "${LOCAL_IMAGE_MAP[$svc]:-}" ]] || fail "Unsupported service: $svc"
  grep -Fxq "$svc" <<<"$required_services" || fail "Compose does not define service: $svc"
done

if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "zitadel-login-vue"; then
  secret="$(env_value ZITADEL_LOGIN_VUE_COOKIE_SECRET)"
  [ "${#secret}" -ge 32 ] && [[ "$secret" != REPLACE_* ]] || fail "ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set before deploying zitadel-login-vue"
fi

if [ "$PRUNE_BUILD_CACHE" -eq 1 ]; then
  log "Pruning Docker build cache before VPS build"
  docker builder prune -f 2>&1 | tee -a "$DEPLOY_LOG" || true
fi

log "Snapshotting current images for rollback tag: $ROLLBACK_TAG"
for svc in "${SERVICES[@]}"; do
  cid=$(compose ps -q "$svc" 2>/dev/null | head -n 1 || true)
  if [ -n "$cid" ]; then
    image_id=$(docker inspect --format '{{.Image}}' "$cid")
    docker tag "$image_id" "${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}"
    log "  $svc snapshot saved as ${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}"
  else
    warn "  $svc is not currently running; rollback snapshot skipped"
  fi
done

log "Building selected images on VPS"
build_selected_images || rollback_once "Image build failed"

log "Rolling update with health gates"
for svc in "${SERVICES[@]}"; do
  log "  updating $svc"
  if supports_green_prewarm "$svc"; then
    prewarm_green_replicas "$svc" || rollback_once "Green prewarm failed: $svc"
  fi
  compose up -d --no-deps --scale "$svc=$(desired_scale "$svc")" "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || rollback_once "Service update failed: $svc"
  TOUCHED_SERVICES+=("$svc")
  wait_healthy "$svc" 180 || rollback_once "Health gate failed: $svc"
  cleanup_green_for_service "$svc"
done

SSO_DOMAIN=$(env_value SSO_DOMAIN)
ZITADEL_DOMAIN=$(env_value ZITADEL_DOMAIN)
SSO_ADMIN_VUE_BASE_PATH=$(env_value SSO_ADMIN_VUE_BASE_PATH /__vue-preview)

log "Running smoke checks"
smoke_check "SSO Discovery" "https://${SSO_DOMAIN}/.well-known/openid-configuration" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: SSO Discovery"
smoke_check "Admin Panel" "https://${SSO_DOMAIN}/" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: Admin Panel"
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "sso-admin-vue"; then
  smoke_check "Vue Admin Canary" "https://${SSO_DOMAIN}${SSO_ADMIN_VUE_BASE_PATH}/healthz" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: Vue Admin Canary"
fi
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "zitadel-login"; then
  smoke_check "Zitadel Login Health" "https://${ZITADEL_DOMAIN}/ui/v2/login/healthy" "^200$" "$ZITADEL_DOMAIN" || rollback_once "Smoke check failed: Zitadel Login Health"
fi
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "zitadel-login-vue"; then
  ZITADEL_LOGIN_VUE_BASE_PATH=$(env_value ZITADEL_LOGIN_VUE_BASE_PATH /ui/v2/login-vue)
  smoke_check "Zitadel Vue Login Canary" "https://${ZITADEL_DOMAIN}${ZITADEL_LOGIN_VUE_BASE_PATH}/healthz" "^200$" "$ZITADEL_DOMAIN" || rollback_once "Smoke check failed: Zitadel Vue Login Canary"
fi
APP_A_DOMAIN=$(env_value APP_A_DOMAIN)
APP_B_DOMAIN=$(env_value APP_B_DOMAIN)
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "app-a-next"; then
  smoke_check "App A Health" "https://${APP_A_DOMAIN}/healthz" "^200$" "$APP_A_DOMAIN" || rollback_once "Smoke check failed: App A Health"
fi
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "app-b-laravel"; then
  smoke_check "App B Health" "https://${APP_B_DOMAIN}/health" "^200$" "$APP_B_DOMAIN" || rollback_once "Smoke check failed: App B Health"
fi

echo "$TAG" > "$DEPLOY_TAG_FILE"
echo "$ROLLBACK_TAG" > "$ROLLBACK_TAG_FILE"

trap - ERR

log "Direct VPS deploy complete: $TAG"
log "Rollback tag available: $ROLLBACK_TAG"
log "Log: $DEPLOY_LOG"
