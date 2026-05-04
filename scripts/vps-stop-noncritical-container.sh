#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${1:-}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-30}"

allowed_container() {
  case "$1" in
    n8n-n8n-1) return 0 ;;
    *) return 1 ;;
  esac
}

usage() {
  echo "Usage: $0 <container-name>" >&2
  echo "Allowed containers: n8n-n8n-1" >&2
}

require_valid_input() {
  if [[ -z "$CONTAINER_NAME" ]]; then
    usage
    exit 2
  fi

  if ! allowed_container "$CONTAINER_NAME"; then
    echo "Refusing to stop non-whitelisted container: $CONTAINER_NAME" >&2
    usage
    exit 3
  fi

  if ! [[ "$STOP_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
    echo "STOP_TIMEOUT_SECONDS must be a positive integer" >&2
    exit 4
  fi
}

print_container_state() {
  local label="$1"

  echo "=== ${label}: ${CONTAINER_NAME} ==="
  docker inspect --format \
    'name={{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}} image={{.Config.Image}} started={{.State.StartedAt}}' \
    "$CONTAINER_NAME" 2>/dev/null || {
      echo "Container not found: $CONTAINER_NAME" >&2
      exit 5
    }
}

stop_container() {
  local status

  status="$(docker inspect --format '{{.State.Status}}' "$CONTAINER_NAME")"
  if [[ "$status" != "running" ]]; then
    echo "Container is already not running: $CONTAINER_NAME status=$status"
    return
  fi

  echo "Stopping non-critical container: $CONTAINER_NAME"
  docker stop --time "$STOP_TIMEOUT_SECONDS" "$CONTAINER_NAME"
}

require_valid_input
print_container_state "before"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' "$CONTAINER_NAME" || true
stop_container
print_container_state "after"
echo "Rollback command: docker start $CONTAINER_NAME"
