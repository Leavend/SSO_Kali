#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${VPS_HOST:-145.79.15.8}"
REMOTE_USER="${VPS_USER:-root}"
REMOTE_PATH="${VPS_PATH:-/opt/sso-prototype-dev}"
VPS_SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519}"
MODE="full"
PRECHECK_ONLY=0
SKIP_BUILD=0
VPS_ONLY=0
RUN_HOSTED_LOGIN_SMOKE=1
RUN_HOSTED_LOGIN_RESPONSIVE=1
RUN_HOSTED_LOGIN_THEME_TOGGLE=1
RUN_HOSTED_LOGIN_LANGUAGE_TOGGLE=1
SSH_OPTS=(
  -F /dev/null
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
  -o IdentitiesOnly=yes
  -o ServerAliveInterval=30
  -o ConnectTimeout=10
)
RSYNC_FLAGS=(
  -az
  --delete
  --exclude=.DS_Store
  --exclude=.env
  --exclude=.env.dev
  --exclude=.env.testing
  --exclude=.secrets
  --exclude=.git
  --exclude=vendor
  --exclude=node_modules
  --exclude=.next
  --exclude=coverage
  --exclude=test-results
  --exclude=storage/logs
  --exclude=storage/framework/cache
  --exclude=storage/framework/sessions
  --exclude=storage/framework/views
  --exclude=.phpunit.result.cache
)

log() {
  printf '[deploy] %s\n' "$*"
}

die() {
  printf '[deploy][ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [options]

Options:
  --mode <full|backend-only|frontend-only|admin-vue-only|queue-only>
  --full
  --backend-only
  --frontend-only
  --admin-vue-only
  --queue-only
  --preflight-only
  --skip-build
  --vps-only
  --skip-hosted-login-smoke
  --skip-hosted-login-responsive
  --skip-hosted-login-theme-toggle
  --skip-hosted-login-language-toggle
  -h, --help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode) MODE="${2:-}"; shift ;;
      --full) MODE="full" ;;
      --backend-only) MODE="backend-only" ;;
      --frontend-only) MODE="frontend-only" ;;
      --admin-vue-only) MODE="admin-vue-only" ;;
      --queue-only) MODE="queue-only" ;;
      --preflight-only) PRECHECK_ONLY=1 ;;
      --skip-build) SKIP_BUILD=1 ;;
      --vps-only) VPS_ONLY=1 ;;
      --skip-hosted-login-smoke) RUN_HOSTED_LOGIN_SMOKE=0 ;;
      --skip-hosted-login-responsive) RUN_HOSTED_LOGIN_RESPONSIVE=0 ;;
      --skip-hosted-login-theme-toggle) RUN_HOSTED_LOGIN_THEME_TOGGLE=0 ;;
      --skip-hosted-login-language-toggle) RUN_HOSTED_LOGIN_LANGUAGE_TOGGLE=0 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac
    shift
  done
}

validate_mode() {
  case "$MODE" in
    full|backend-only|frontend-only|admin-vue-only|queue-only) ;;
    *) die "Unsupported mode: $MODE" ;;
  esac
}

require_commands() {
  command -v bash >/dev/null 2>&1 || die "Missing required command: bash"
  command -v ssh >/dev/null 2>&1 || die "Missing required command: ssh"
  command -v rsync >/dev/null 2>&1 || die "Missing required command: rsync"
}

configure_ssh_identity() {
  [[ -f "$VPS_SSH_KEY" ]] || die "Missing VPS SSH key: $VPS_SSH_KEY"
  SSH_OPTS+=(-i "$VPS_SSH_KEY")
}

run_hosted_login_smoke() {
  (( PRECHECK_ONLY )) && return 0
  (( RUN_HOSTED_LOGIN_SMOKE )) || return 0
  [[ "$MODE" == "full" ]] || return 0
  command -v node >/dev/null 2>&1 || die "Missing required command: node"
  log "Running hosted login smoke validation"
  (cd "$ROOT_DIR" && node ./infra/zitadel-login/validate-hosted-login-experience.mjs)
}

run_hosted_login_responsive() {
  (( PRECHECK_ONLY )) && return 0
  (( RUN_HOSTED_LOGIN_RESPONSIVE )) || return 0
  [[ "$MODE" == "full" ]] || return 0
  command -v node >/dev/null 2>&1 || die "Missing required command: node"
  log "Running hosted login responsive validation"
  (cd "$ROOT_DIR" && node ./infra/zitadel-login/validate-hosted-login-responsive.mjs)
}

run_hosted_login_theme_toggle() {
  (( PRECHECK_ONLY )) && return 0
  (( RUN_HOSTED_LOGIN_THEME_TOGGLE )) || return 0
  [[ "$MODE" == "full" ]] || return 0
  command -v node >/dev/null 2>&1 || die "Missing required command: node"
  log "Running hosted login theme toggle validation"
  (cd "$ROOT_DIR" && node ./infra/zitadel-login/validate-hosted-login-theme-toggle.mjs)
}

run_hosted_login_language_toggle() {
  (( PRECHECK_ONLY )) && return 0
  (( RUN_HOSTED_LOGIN_LANGUAGE_TOGGLE )) || return 0
  [[ "$MODE" == "full" ]] || return 0
  command -v node >/dev/null 2>&1 || die "Missing required command: node"
  log "Running hosted login language toggle validation"
  (cd "$ROOT_DIR" && node ./infra/zitadel-login/validate-hosted-login-language-toggle.mjs)
}

sync_repo() {
  log "Syncing repository to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
  rsync "${RSYNC_FLAGS[@]}" \
    -e "ssh ${SSH_OPTS[*]}" \
    "$ROOT_DIR/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"
}

run_remote() {
  local cmd=(
    bash ./deploy-remote.sh
    --mode "$MODE"
  )

  (( PRECHECK_ONLY )) && cmd+=(--preflight-only)
  (( SKIP_BUILD )) && cmd+=(--skip-build)

  log "Running remote deploy: mode=${MODE}"
  ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
    "cd $(printf '%q' "$REMOTE_PATH") && $(printf '%q ' "${cmd[@]}")"
}

main() {
  parse_args "$@"
  validate_mode
  require_commands
  configure_ssh_identity
  (( VPS_ONLY )) || sync_repo
  run_remote
  run_hosted_login_smoke
  run_hosted_login_responsive
  run_hosted_login_theme_toggle
  run_hosted_login_language_toggle
  log "Deploy workflow finished"
}

main "$@"
