#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sso-prototype-dev}"

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    printf '[check-container-resource-health][ERROR] docker CLI is not installed\n' >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    printf '[check-container-resource-health][ERROR] docker daemon is not reachable\n' >&2
    exit 1
  fi
}

containers() {
  docker ps --format '{{.Names}}' | grep "^${PROJECT_NAME}-" || true
}

throttled_count() {
  docker exec "$1" sh -lc 'cat /sys/fs/cgroup/cpu.stat 2>/dev/null || cat /sys/fs/cgroup/cpu/cpu.stat 2>/dev/null' \
    | awk '/nr_throttled/{print $2}' \
    | tail -1
}

oom_killed() {
  docker inspect -f '{{if .State.OOMKilled}}true{{else}}false{{end}}' "$1"
}

found=0

require_docker

while IFS= read -r container; do
  [[ -z "$container" ]] && continue
  found=1

  oom="$(oom_killed "$container")"
  throttled="$(throttled_count "$container")"
  throttled="${throttled:-0}"

  if [[ "$oom" == "true" ]]; then
    printf '[check-container-resource-health][ERROR] %s reported OOMKilled=true\n' "$container" >&2
    exit 1
  fi

  if [[ "$throttled" =~ ^[0-9]+$ ]] && [[ "$throttled" -gt 0 ]]; then
    printf '[check-container-resource-health][WARN] %s cpu throttling detected: nr_throttled=%s\n' "$container" "$throttled" >&2
  else
    printf '[check-container-resource-health] %s OK\n' "$container"
  fi
done < <(containers)

if [[ "$found" -eq 0 ]]; then
  printf '[check-container-resource-health][ERROR] no containers matched project prefix %s-\n' "$PROJECT_NAME" >&2
  exit 1
fi
