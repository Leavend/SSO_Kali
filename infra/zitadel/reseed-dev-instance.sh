#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"

log() {
  printf '[reseed-zitadel] %s\n' "$*"
}

die() {
  printf '[reseed-zitadel][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_service() {
  local service="$1"
  local timeout="${2:-120}"
  local elapsed=0
  local container_id status

  while (( elapsed < timeout )); do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"

    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      case "$status" in
        healthy|running)
          log "Service '$service' is $status"
          return 0
          ;;
        unhealthy|exited|dead)
          docker logs --tail 120 "$container_id" >&2 || true
          die "Service '$service' entered unhealthy state ($status)"
          ;;
      esac
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  die "Timed out waiting for service '$service'"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

main() {
  require_command docker

  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

  POSTGRES_DB="$(get_env POSTGRES_DB)"
  POSTGRES_ADMIN_USER="$(get_env POSTGRES_ADMIN_USER)"
  COMPOSE_PROJECT_NAME="$(get_env COMPOSE_PROJECT_NAME)"

  [[ -n "$POSTGRES_DB" ]] || die "Missing POSTGRES_DB"
  [[ -n "$POSTGRES_ADMIN_USER" ]] || die "Missing POSTGRES_ADMIN_USER"
  [[ -n "$COMPOSE_PROJECT_NAME" ]] || die "Missing COMPOSE_PROJECT_NAME"

  log "Stopping dev stack"
  compose down --remove-orphans

  log "Starting postgres for ZITADEL reseed"
  compose up -d postgres
  wait_for_service postgres 180

  log "Dropping and recreating database '${POSTGRES_DB}'"
  docker exec "${COMPOSE_PROJECT_NAME}-postgres-1" sh -lc \
    "psql -U '${POSTGRES_ADMIN_USER}' -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${POSTGRES_DB};
CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_ADMIN_USER};
SQL"

  log "Removing ZITADEL bootstrap volume"
  docker volume rm sso-dev-zitadel-bootstrap >/dev/null 2>&1 || true

  log "Reseed preparation complete"
}

main "$@"
