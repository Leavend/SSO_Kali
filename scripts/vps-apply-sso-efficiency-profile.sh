#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
MODE="audit"
COMPOSE_SOURCE=""
STOP_DEMO_SERVICES="true"
STOP_INACTIVE_LOGIN="true"
RECREATE_DATA_PLANE="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --mode) MODE="$2"; shift ;;
    --compose-source) COMPOSE_SOURCE="$2"; shift ;;
    --stop-demo-services) STOP_DEMO_SERVICES="$2"; shift ;;
    --stop-inactive-login) STOP_INACTIVE_LOGIN="$2"; shift ;;
    --recreate-data-plane) RECREATE_DATA_PLANE="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
STAMP="$(date -u +%Y%m%d%H%M%S)"
ENV_BACKUP="$PROJECT_DIR/.env.dev.pre-efficiency-$STAMP"
COMPOSE_BACKUP="$PROJECT_DIR/docker-compose.dev.yml.pre-efficiency-$STAMP"
ROLLBACK_FILE="$PROJECT_DIR/sso-efficiency-rollback-$STAMP.sh"
RELEASE_TAG_FILE="/tmp/.sso-deploy-rollback-tag"

log() { printf '\n[sso-efficiency] %s\n' "$*"; }
compose() { docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

require_bool() {
  case "$1" in
    true|false) ;;
    *) echo "$2 must be true or false" >&2; exit 2 ;;
  esac
}

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  case "$MODE" in audit|apply) ;; *) echo "--mode must be audit or apply" >&2; exit 2 ;; esac
  require_bool "$STOP_DEMO_SERVICES" "--stop-demo-services"
  require_bool "$STOP_INACTIVE_LOGIN" "--stop-inactive-login"
  require_bool "$RECREATE_DATA_PLANE" "--recreate-data-plane"
  if [[ -n "$COMPOSE_SOURCE" && ! -f "$COMPOSE_SOURCE" ]]; then
    echo "Missing compose source: $COMPOSE_SOURCE" >&2
    exit 1
  fi
}

env_value() {
  local key="$1" fallback="${2:-}"
  awk -F= -v key="$key" -v fallback="$fallback" '
    $1 == key { value = substr($0, length($1) + 2) }
    END { if (value == "") print fallback; else print value }
  ' "$ENV_FILE"
}

detect_app_image_tag() {
  local id image
  id="$(container_id sso-backend)"
  [[ -n "$id" ]] || id="$(container_id sso-frontend)"
  [[ -n "$id" ]] || id="$(container_id zitadel-login-vue)"
  [[ -n "$id" ]] || return 1

  image="$(docker inspect --format '{{.Config.Image}}' "$id" 2>/dev/null || true)"
  case "$image" in
    sso-dev-*:*[!:\ ]) printf '%s\n' "${image##*:}" ;;
    *) return 1 ;;
  esac
}

resolve_app_image_tag() {
  local tag
  tag="${APP_IMAGE_TAG:-$(env_value APP_IMAGE_TAG "")}"

  if [[ -z "$tag" && -f "$RELEASE_TAG_FILE" ]]; then
    tag="$(tr -d '[:space:]' < "$RELEASE_TAG_FILE")"
  fi

  if [[ -z "$tag" ]]; then
    tag="$(detect_app_image_tag || true)"
  fi

  if [[ -n "$tag" ]]; then
    export APP_IMAGE_TAG="$tag"
    echo "app_image_tag=$APP_IMAGE_TAG"
    return
  fi

  echo "app_image_tag=<missing>; app service recreates will be skipped unless their target image exists"
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      done = 1
      next
    }
    { print }
    END {
      if (!done) print key "=" value
    }
  ' "$ENV_FILE" > "$tmp"
  install -m 0640 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

write_rollback_header() {
  [[ "$MODE" == "apply" ]] || return
  {
    echo "#!/usr/bin/env bash"
    echo "set -Eeuo pipefail"
    echo "cd '$PROJECT_DIR'"
    echo "# Generated before applying SSO efficiency profile on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$ROLLBACK_FILE"
  chmod 700 "$ROLLBACK_FILE"
}

append_rollback() {
  [[ "$MODE" == "apply" ]] || return
  printf '%s\n' "$*" >> "$ROLLBACK_FILE"
}

install_compose_source() {
  [[ -n "$COMPOSE_SOURCE" ]] || return
  log "Validate Compose source"
  docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_SOURCE" config --quiet
  [[ "$MODE" == "apply" ]] || { echo "planned_compose_source=$COMPOSE_SOURCE"; return; }

  log "Install Compose efficiency profile"
  cp "$COMPOSE_FILE" "$COMPOSE_BACKUP"
  chmod 0640 "$COMPOSE_BACKUP"
  append_rollback "install -m 0644 '$COMPOSE_BACKUP' '$COMPOSE_FILE'"
  install -m 0644 "$COMPOSE_SOURCE" "$COMPOSE_FILE"
  compose config --quiet
  echo "compose_backup=$COMPOSE_BACKUP"
}

apply_env_profile() {
  local changes=(
    "APP_DEBUG=false"
    "LOG_LEVEL=warning"
    "TELESCOPE_ENABLED=false"
    "TELESCOPE_RECORD_ALL=false"
    "TELESCOPE_LOG_LEVEL=warning"
    "TRAEFIK_LOG_LEVEL=WARN"
    "TRAEFIK_ACCESSLOG_ENABLED=false"
    "ZITADEL_ACCESS_LOG_STDOUT_ENABLED=false"
    "QUEUE_CONNECTION=redis"
    "ZITADEL_LOGIN_API_TIMEOUT_MS=15000"
  )
  local item key value

  log "Apply low-overhead env profile"
  if [[ "$MODE" == "apply" ]]; then
    cp "$ENV_FILE" "$ENV_BACKUP"
    chmod 0640 "$ENV_BACKUP"
    append_rollback "install -m 0640 '$ENV_BACKUP' '$ENV_FILE'"
    echo "env_backup=$ENV_BACKUP"
  fi

  for item in "${changes[@]}"; do
    key="${item%%=*}"
    value="${item#*=}"
    echo "$key: $(env_value "$key" "<unset>") -> $value"
    [[ "$MODE" == "apply" ]] && set_env_value "$key" "$value"
  done
}

container_id() {
  compose ps -q "$1" 2>/dev/null || true
}

service_health() {
  local id="$1"
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo unknown
}

wait_healthy() {
  local service="$1" timeout="${2:-180}" elapsed=0 id health
  while (( elapsed < timeout )); do
    id="$(container_id "$service")"
    if [[ -n "$id" ]]; then
      health="$(service_health "$id")"
      case "$health" in
        healthy|running) echo "service=$service health=$health"; return 0 ;;
        unhealthy|exited|dead)
          echo "service=$service health=$health" >&2
          docker logs --tail 60 "$id" 2>&1 || true
          return 1
          ;;
      esac
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "service=$service health=timeout" >&2
  return 1
}

stop_service_if_running() {
  local service="$1" reason="$2" id status
  id="$(container_id "$service")"
  [[ -n "$id" ]] || { echo "service=$service stop=missing reason=$reason"; return; }
  status="$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null || echo unknown)"
  echo "service=$service status=$status planned_stop_reason=$reason"
  [[ "$MODE" == "apply" && "$status" == "running" ]] || return
  append_rollback "docker compose --project-directory '$PROJECT_DIR' --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --no-deps --no-build --pull never '$service'"
  compose stop --timeout 30 "$service"
}

active_login_service() {
  local active_path vue_path
  active_path="$(env_value ZITADEL_LOGIN_ACTIVE_BASE_PATH "/ui/v2/login")"
  vue_path="$(env_value ZITADEL_LOGIN_VUE_BASE_PATH "/ui/v2/auth")"
  if [[ "$active_path" == "$vue_path" || "$active_path" == "/ui/v2/auth" ]]; then
    echo "zitadel-login-vue"
  else
    echo "zitadel-login"
  fi
}

stop_noncritical_services() {
  local active_login
  active_login="$(active_login_service)"
  log "Trim non-critical runtime services"
  echo "active_login_service=$active_login"

  if [[ "$STOP_INACTIVE_LOGIN" == "true" ]]; then
    if [[ "$active_login" == "zitadel-login-vue" ]]; then
      stop_service_if_running "zitadel-login" "inactive hosted login rollback path"
    else
      stop_service_if_running "zitadel-login-vue" "inactive Vue login canary path"
    fi
  fi

  if [[ "$STOP_DEMO_SERVICES" == "true" ]]; then
    stop_service_if_running "sso-admin-vue" "preview admin UI is not on the primary SSO path"
    stop_service_if_running "app-a-next" "demo client is not required for primary SSO login"
    stop_service_if_running "app-b-laravel" "demo client is not required for primary SSO login"
  fi
}

budget_for_service() {
  case "$1" in
    proxy) echo "0.20 1536 128m" ;;
    postgres) echo "1.00 2048 1024m" ;;
    redis) echo "0.25 1536 256m" ;;
    zitadel-api) echo "1.00 2048 1024m" ;;
    zitadel-login|zitadel-login-vue) echo "0.40 1536 384m" ;;
    sso-backend|sso-backend-worker) echo "0.45 512 512m" ;;
    sso-frontend|sso-admin-vue) echo "0.25 256 256m" ;;
    app-a-next) echo "0.10 128 192m" ;;
    app-b-laravel) echo "0.15 128 384m" ;;
    *) return 1 ;;
  esac
}

release_image_for_service() {
  case "$1" in
    sso-backend|sso-backend-worker) echo "sso-dev-sso-backend:${APP_IMAGE_TAG:-local}" ;;
    sso-frontend) echo "sso-dev-sso-frontend:${APP_IMAGE_TAG:-local}" ;;
    sso-admin-vue) echo "sso-dev-sso-admin-vue:${APP_IMAGE_TAG:-local}" ;;
    zitadel-login) echo "sso-dev-zitadel-login:${APP_IMAGE_TAG:-local}" ;;
    zitadel-login-vue) echo "sso-dev-zitadel-login-vue:${APP_IMAGE_TAG:-local}" ;;
    app-a-next) echo "sso-dev-app-a-next:${APP_IMAGE_TAG:-local}" ;;
    app-b-laravel) echo "sso-dev-app-b-laravel:${APP_IMAGE_TAG:-local}" ;;
    *) return 1 ;;
  esac
}

preflight_release_image() {
  local service="$1" image id status
  image="$(release_image_for_service "$service" 2>/dev/null || true)"
  [[ -n "$image" ]] || return 0
  docker image inspect "$image" >/dev/null 2>&1 && return 0

  id="$(container_id "$service")"
  status="$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null || echo missing)"
  if [[ "$status" == "running" ]]; then
    echo "service=$service recreate=skipped missing_image=$image status=$status"
    return 1
  fi

  echo "service=$service recreate=blocked missing_image=$image status=$status" >&2
  return 2
}

apply_runtime_budget() {
  local service="$1" id cpus shares memory
  id="$(container_id "$service")"
  [[ -n "$id" ]] || { echo "service=$service budget=missing"; return; }
  read -r cpus shares memory < <(budget_for_service "$service")
  echo "service=$service budget_cpus=$cpus budget_shares=$shares budget_memory=$memory"
  [[ "$MODE" == "apply" ]] || return
  docker update --cpus "$cpus" --cpu-shares "$shares" --memory "$memory" "$id" >/dev/null
}

apply_runtime_budgets() {
  local service
  log "Apply CPU scheduling profile"
  for service in proxy postgres redis zitadel-api zitadel-login zitadel-login-vue sso-backend sso-backend-worker sso-frontend sso-admin-vue app-a-next app-b-laravel; do
    apply_runtime_budget "$service"
  done
}

recreate_service() {
  local service="$1" image_status
  echo "recreate=$service"
  [[ "$MODE" == "apply" ]] || return
  set +e
  preflight_release_image "$service"
  image_status=$?
  set -e
  case "$image_status" in
    0) ;;
    1) return 0 ;;
    *) return 1 ;;
  esac
  compose up -d --no-deps --no-build --pull never "$service"
  wait_healthy "$service" 180
}

reconcile_primary_services() {
  local active_login
  active_login="$(active_login_service)"
  log "Recreate primary services with lean config"
  resolve_app_image_tag
  if [[ "$RECREATE_DATA_PLANE" == "true" ]]; then
    recreate_service postgres
    recreate_service redis
  fi
  recreate_service zitadel-api
  recreate_service "$active_login"
  recreate_service sso-backend
  recreate_service sso-backend-worker
  recreate_service sso-frontend
  recreate_service proxy
}

probe_proxy() {
  local host="$1" path="$2" code
  code="$(curl -ksS -H "Host: ${host}" -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080${path}" || true)"
  echo "${host}${path} ${code}"
  [[ "$code" =~ ^[23] ]]
}

probe_zitadel_ready() {
  local code
  code="$(compose exec -T zitadel-api curl -fsS -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 15 http://127.0.0.1:8080/debug/ready || true)"
  echo "zitadel-api:/debug/ready ${code}"
  [[ "$code" == "200" ]]
}

smoke_primary_paths() {
  local zitadel_domain sso_domain active_login_path
  zitadel_domain="$(env_value ZITADEL_DOMAIN)"
  sso_domain="$(env_value SSO_DOMAIN)"
  active_login_path="$(env_value ZITADEL_LOGIN_ACTIVE_BASE_PATH "/ui/v2/login")"
  log "Smoke primary SSO paths"
  probe_proxy "$zitadel_domain" "${active_login_path%/}/login"
  probe_zitadel_ready
  probe_proxy "$sso_domain" "/.well-known/openid-configuration"
}

print_top_stats() {
  log "Post-profile container stats"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' \
    | grep -E 'NAME|sso-prototype-dev-(postgres|proxy|redis|zitadel|sso-backend|sso-frontend|sso-admin-vue|app-a-next|app-b-laravel)' || true
}

require_runtime
write_rollback_header
install_compose_source
apply_env_profile
stop_noncritical_services
apply_runtime_budgets
reconcile_primary_services
smoke_primary_paths
print_top_stats

if [[ "$MODE" == "apply" ]]; then
  log "Rollback"
  echo "rollback_file=$ROLLBACK_FILE"
fi
