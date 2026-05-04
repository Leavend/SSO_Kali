#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
MODE="audit"
TARGET_SERVICE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --mode) MODE="$2"; shift ;;
    --service) TARGET_SERVICE="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
ROLLBACK_FILE="$PROJECT_DIR/runtime-budget-rollback-$(date -u +%Y%m%d%H%M%S).sh"

SERVICES=(
  proxy
  postgres
  redis
  zitadel-api
  zitadel-login
  zitadel-login-vue
  sso-backend
  sso-backend-worker
  sso-frontend
  sso-admin-vue
  app-a-next
  app-b-laravel
)

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

usage() {
  echo "Usage: $0 [--project-dir PATH] [--mode audit|apply] [--service all|SERVICE]" >&2
}

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  case "$MODE" in
    audit|apply) ;;
    *) usage; exit 2 ;;
  esac
  if [[ "$TARGET_SERVICE" != "all" ]] && ! service_allowed "$TARGET_SERVICE"; then
    echo "Unsupported service: $TARGET_SERVICE" >&2
    usage
    exit 2
  fi
}

service_allowed() {
  local service="$1" candidate
  for candidate in "${SERVICES[@]}"; do
    [[ "$candidate" == "$service" ]] && return 0
  done
  return 1
}

budget_for_service() {
  case "$1" in
    proxy) echo "0.20 1536 128m 134217728" ;;
    postgres) echo "1.00 2048 1024m 1073741824" ;;
    redis) echo "0.25 1536 256m 268435456" ;;
    zitadel-api) echo "1.00 2048 1024m 1073741824" ;;
    zitadel-login|zitadel-login-vue) echo "0.40 1536 384m 402653184" ;;
    sso-backend|sso-backend-worker) echo "0.45 512 512m 536870912" ;;
    sso-frontend|sso-admin-vue) echo "0.25 256 256m 268435456" ;;
    app-a-next) echo "0.10 128 192m 201326592" ;;
    app-b-laravel) echo "0.15 128 384m 402653184" ;;
    *) return 1 ;;
  esac
}

nano_to_cpus() {
  local nano="$1"
  if [[ "$nano" == "0" ]]; then
    echo "0"
    return
  fi

  awk -v nano="$nano" 'BEGIN { printf "%.2f", nano / 1000000000 }'
}

write_rollback_header() {
  if [[ "$MODE" != "apply" ]]; then
    return
  fi

  {
    echo "#!/usr/bin/env bash"
    echo "set -Eeuo pipefail"
    echo "# Generated before applying SSO runtime budgets on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$ROLLBACK_FILE"
  chmod 700 "$ROLLBACK_FILE"
}

append_rollback_command() {
  local container_id="$1" old_nano="$2" old_shares="$3" old_memory="$4"
  local old_cpus

  [[ "$MODE" == "apply" ]] || return
  old_cpus="$(nano_to_cpus "$old_nano")"

  {
    printf 'docker update --cpus %q --cpu-shares %q --memory %q %q\n' \
      "$old_cpus" "$old_shares" "$old_memory" "$container_id"
  } >> "$ROLLBACK_FILE"
}

inspect_field() {
  local container_id="$1" template="$2"
  docker inspect --format "$template" "$container_id"
}

service_in_scope() {
  local service="$1"
  [[ "$TARGET_SERVICE" == "all" || "$TARGET_SERVICE" == "$service" ]]
}

audit_or_apply_service() {
  local service="$1" container_id expected_cpus expected_shares expected_memory expected_memory_bytes
  local actual_nano actual_shares actual_memory expected_nano status

  service_in_scope "$service" || return

  container_id="$(compose ps -q "$service" || true)"
  if [[ -z "$container_id" ]]; then
    echo "service=$service status=missing"
    return
  fi

  read -r expected_cpus expected_shares expected_memory expected_memory_bytes < <(budget_for_service "$service")
  expected_nano="$(awk -v cpus="$expected_cpus" 'BEGIN { printf "%.0f", cpus * 1000000000 }')"
  actual_nano="$(inspect_field "$container_id" '{{.HostConfig.NanoCpus}}')"
  actual_shares="$(inspect_field "$container_id" '{{.HostConfig.CpuShares}}')"
  actual_memory="$(inspect_field "$container_id" '{{.HostConfig.Memory}}')"

  status="ok"
  if [[ "$actual_nano" != "$expected_nano" || "$actual_shares" != "$expected_shares" || "$actual_memory" != "$expected_memory_bytes" ]]; then
    status="drift"
  fi

  echo "service=$service status=$status actual_cpus=$(nano_to_cpus "$actual_nano") expected_cpus=$expected_cpus actual_cpu_shares=$actual_shares expected_cpu_shares=$expected_shares actual_memory=$actual_memory expected_memory=$expected_memory_bytes"

  if [[ "$MODE" == "apply" && "$status" == "drift" ]]; then
    append_rollback_command "$container_id" "$actual_nano" "$actual_shares" "$actual_memory"
    docker update \
      --cpus "$expected_cpus" \
      --cpu-shares "$expected_shares" \
      --memory "$expected_memory" \
      "$container_id" >/dev/null
    echo "service=$service apply=updated"
  fi
}

require_runtime
write_rollback_header

for service in "${SERVICES[@]}"; do
  audit_or_apply_service "$service"
done

if [[ "$MODE" == "apply" ]]; then
  echo "Rollback file: $ROLLBACK_FILE"
fi
