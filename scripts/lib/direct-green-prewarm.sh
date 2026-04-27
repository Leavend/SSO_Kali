#!/usr/bin/env bash
# Green replica helpers for direct VPS deploy.

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
  local svc="$1" cid="$2" timeout="${3:-180}" elapsed=0 path port status
  path="$(health_path "$svc")"
  port="$(health_port "$svc")"

  while [ "$elapsed" -lt "$timeout" ]; do
    if docker exec "$cid" wget -q -O - "http://127.0.0.1:${port}${path}" >/dev/null 2>&1; then
      return 0
    fi

    status=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
    case "$status" in
      exited|dead)
        warn "  green $svc container $cid exited"
        docker logs --tail 60 "$cid" 2>&1 | tee -a "$DEPLOY_LOG" || true
        return 1
        ;;
    esac

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
    docker run -d --name "$green" --restart unless-stopped --network "$network" \
      --env-file "$env_file" --label-file "$label_file" $mounts "$image" >/dev/null
    GREEN_CONTAINERS+=("$green")
    wait_green_healthy "$svc" "$green" 180 || return 1
  done

  rm -f "$env_file" "$label_file"
  log "  green $svc replicas are healthy; allowing proxy discovery"
  sleep 8
}
