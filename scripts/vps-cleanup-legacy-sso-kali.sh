#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT="${PROJECT:-sso-kali}"
PROD_PROJECT="${PROD_PROJECT:-sso-backend-prod}"
BACKUP_DIR="${BACKUP_DIR:-/opt/sso-backend-prod/backups/legacy-sso-kali}"
EXECUTE="false"
SKIP_BACKUP="false"
TAIL_LINES="80"

log() { printf '[sso-kali-legacy-cleanup] %s\n' "$*"; }
warn() { printf '[sso-kali-legacy-cleanup][WARN] %s\n' "$*" >&2; }
die() { printf '[sso-kali-legacy-cleanup][ERROR] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  sudo scripts/vps-cleanup-legacy-sso-kali.sh [options]

Options:
  --execute            Actually create DB backup and stop legacy sso-kali containers.
                       Without this flag the script is audit/dry-run only.
  --project NAME       Legacy compose project name. Default: sso-kali.
  --prod-project NAME  Production compose project name. Default: sso-backend-prod.
  --backup-dir DIR     Backup directory. Default: /opt/sso-backend-prod/backups/legacy-sso-kali.
  --skip-backup        Allow stop without DB backup. Not recommended.
  --tail-lines N       Log lines to print for legacy containers during audit. Default: 80.
  -h, --help           Show help.

Safety principles:
  - Never runs broad Docker cleanup commands.
  - Refuses to continue if production containers depend on legacy networks/volumes.
  - Backs up legacy PostgreSQL before stopping containers unless --skip-backup is explicit.
  - Stops only containers labelled with com.docker.compose.project=<project>.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE="true"; shift ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --prod-project) PROD_PROJECT="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --skip-backup) SKIP_BACKUP="true"; shift ;;
    --tail-lines) TAIL_LINES="${2:-80}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$PROJECT" ]] || die 'project must not be empty'
[[ -n "$PROD_PROJECT" ]] || die 'prod project must not be empty'
command -v docker >/dev/null 2>&1 || die 'docker missing'
docker compose version >/dev/null 2>&1 || die 'docker compose plugin missing'

mapfile -t LEGACY_CONTAINERS < <(docker ps -a -q --filter "label=com.docker.compose.project=${PROJECT}")
mapfile -t PROD_CONTAINERS < <(docker ps -a -q --filter "label=com.docker.compose.project=${PROD_PROJECT}")

if (( ${#LEGACY_CONTAINERS[@]} == 0 )); then
  log "No legacy containers found for project ${PROJECT}; nothing to clean."
  exit 0
fi

log "Legacy containers for ${PROJECT}:"
docker ps -a --filter "label=com.docker.compose.project=${PROJECT}" \
  --format '  {{.Names}}\t{{.Status}}\t{{.Image}}'

if (( ${#PROD_CONTAINERS[@]} == 0 )); then
  warn "No production containers found for ${PROD_PROJECT}; dependency check will be conservative."
else
  log "Production containers for ${PROD_PROJECT}:"
  docker ps -a --filter "label=com.docker.compose.project=${PROD_PROJECT}" \
    --format '  {{.Names}}\t{{.Status}}\t{{.Image}}'
fi

legacy_networks() {
  docker network ls --filter "label=com.docker.compose.project=${PROJECT}" --format '{{.Name}}'
}

legacy_volumes() {
  docker volume ls --filter "label=com.docker.compose.project=${PROJECT}" --format '{{.Name}}'
}

inspect_container_networks() {
  local id="$1"
  docker inspect "$id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
}

inspect_container_mounts() {
  local id="$1"
  docker inspect "$id" --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}'
}

check_prod_dependencies() {
  local failures=0 item prod_id prod_name

  mapfile -t LEGACY_NETWORKS < <(legacy_networks)
  mapfile -t LEGACY_VOLUMES < <(legacy_volumes)

  log "Legacy networks: ${LEGACY_NETWORKS[*]:-(none)}"
  log "Legacy volumes: ${LEGACY_VOLUMES[*]:-(none)}"

  for prod_id in "${PROD_CONTAINERS[@]}"; do
    prod_name="$(docker inspect "$prod_id" --format '{{.Name}}' | sed 's#^/##')"

    for item in "${LEGACY_NETWORKS[@]}"; do
      if inspect_container_networks "$prod_id" | grep -Fxq "$item"; then
        warn "Production container ${prod_name} still attached to legacy network ${item}"
        failures=$((failures + 1))
      fi
    done

    for item in "${LEGACY_VOLUMES[@]}"; do
      if inspect_container_mounts "$prod_id" | grep -Fxq "$item"; then
        warn "Production container ${prod_name} still mounts legacy volume ${item}"
        failures=$((failures + 1))
      fi
    done
  done

  if (( failures > 0 )); then
    die "Refusing cleanup: production still depends on ${PROJECT} network/volume resources"
  fi

  log "Dependency check passed: ${PROD_PROJECT} does not use ${PROJECT} networks/volumes."
}

find_legacy_postgres() {
  local id image name
  for id in "${LEGACY_CONTAINERS[@]}"; do
    image="$(docker inspect "$id" --format '{{.Config.Image}}')"
    name="$(docker inspect "$id" --format '{{.Name}}' | sed 's#^/##')"
    if [[ "$name" == *postgres* || "$image" == postgres:* || "$image" == *postgres* ]]; then
      printf '%s\n' "$id"
      return 0
    fi
  done
}

backup_legacy_postgres() {
  local pg_id pg_name backup_file db_user db_name
  pg_id="$(find_legacy_postgres || true)"

  if [[ -z "$pg_id" ]]; then
    warn "No legacy PostgreSQL container found; skipping DB backup."
    return 0
  fi

  pg_name="$(docker inspect "$pg_id" --format '{{.Name}}' | sed 's#^/##')"
  db_user="$(docker exec "$pg_id" printenv POSTGRES_USER 2>/dev/null || true)"
  db_name="$(docker exec "$pg_id" printenv POSTGRES_DB 2>/dev/null || true)"
  db_user="${db_user:-postgres}"
  db_name="${db_name:-postgres}"
  backup_file="${BACKUP_DIR}/${PROJECT}-${pg_name}-$(date -u +%Y%m%dT%H%M%SZ).dump"

  if [[ "$EXECUTE" != "true" ]]; then
    log "DRY-RUN: would create backup ${backup_file} from ${pg_name} database ${db_name}"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  log "Creating PostgreSQL backup: ${backup_file}"
  docker exec "$pg_id" pg_dump -U "$db_user" -d "$db_name" -Fc > "$backup_file"
  chmod 600 "$backup_file"
  test -s "$backup_file" || die "Backup file is empty: ${backup_file}"
  log "Backup completed: ${backup_file}"
}

stop_legacy_containers() {
  local ids=()
  mapfile -t ids < <(docker ps -q --filter "label=com.docker.compose.project=${PROJECT}")

  if (( ${#ids[@]} == 0 )); then
    log "Legacy project ${PROJECT} has no running containers."
    return 0
  fi

  if [[ "$EXECUTE" != "true" ]]; then
    log "DRY-RUN: would stop running legacy containers: ${ids[*]}"
    return 0
  fi

  log "Stopping only legacy containers labelled com.docker.compose.project=${PROJECT}"
  docker stop "${ids[@]}"
}

check_prod_dependencies

log "Recent legacy logs for audit context:"
for id in "${LEGACY_CONTAINERS[@]}"; do
  name="$(docker inspect "$id" --format '{{.Name}}' | sed 's#^/##')"
  log "--- ${name} tail ${TAIL_LINES} ---"
  docker logs --tail "$TAIL_LINES" "$id" 2>&1 | sed 's/^/  /' || true
done

if [[ "$SKIP_BACKUP" == "true" ]]; then
  warn "Skipping backup because --skip-backup was provided."
else
  backup_legacy_postgres
fi

stop_legacy_containers

if [[ "$EXECUTE" == "true" ]]; then
  log "Cleanup completed. Legacy containers are stopped; volumes/networks are preserved for rollback."
else
  log "Dry-run completed. Re-run with --execute to back up and stop legacy containers."
fi
