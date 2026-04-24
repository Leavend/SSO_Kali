#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-dev-sso.timeh.my.id}"
DOMAINS=(
  "dev-sso.timeh.my.id"
  "id.dev-sso.timeh.my.id"
  "app-a.timeh.my.id"
  "app-b.timeh.my.id"
)
BOOTSTRAP_SOURCE="$SCRIPT_DIR/dev-sso.timeh.my.id.bootstrap.conf"
FINAL_SOURCE="$SCRIPT_DIR/dev-sso.timeh.my.id.conf"
SITE_AVAILABLE="/etc/nginx/sites-available/${PRIMARY_DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${PRIMARY_DOMAIN}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PRECHECK_ONLY=0
SKIP_CERTBOT=0

log() {
  printf '[install-dev-sso-nginx] %s\n' "$*"
}

warn() {
  printf '[install-dev-sso-nginx][WARN] %s\n' "$*" >&2
}

die() {
  printf '[install-dev-sso-nginx][ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: sudo ./infra/nginx/install-dev-sso-nginx.sh [options]

Options:
  --email you@example.com  Email for Let's Encrypt registration.
  --preflight-only         Validate DNS and nginx prerequisites only.
  --skip-certbot           Install bootstrap config but skip certificate issuance.
  -h, --help               Show this help text.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

detect_public_ip() {
  ip -4 route get 1.1.1.1 | awk '{for (i = 1; i <= NF; i++) if ($i == "src") {print $(i+1); exit}}'
}

resolve_a_records() {
  local domain="$1"
  local resolver records=""

  for resolver in "" "@1.1.1.1" "@8.8.8.8"; do
    records="$(dig ${resolver} +short A "$domain" | sed '/^$/d' || true)"
    if [[ -n "$records" ]]; then
      printf '%s\n' "$records"
      return 0
    fi
  done

  return 1
}

check_dns() {
  local public_ip domain a_records
  public_ip="$(detect_public_ip)"
  [[ -n "$public_ip" ]] || die "Unable to determine server public IPv4"

  for domain in "${DOMAINS[@]}"; do
    a_records="$(resolve_a_records "$domain" || true)"
    if [[ -z "$a_records" ]]; then
      die "Domain $domain does not have an A record yet"
    fi

    if ! grep -Fxq "$public_ip" <<<"$a_records"; then
      printf '%s\n' "$a_records" >&2
      die "Domain $domain does not point to this server ($public_ip)"
    fi
  done

  log "DNS check passed for all dev domains"
}

backup_existing_site() {
  if [[ -f "$SITE_AVAILABLE" ]]; then
    cp -a "$SITE_AVAILABLE" "${SITE_AVAILABLE}.bak-$(date +%Y%m%d-%H%M%S)"
  fi
}

enable_site_if_needed() {
  if [[ ! -L "$SITE_ENABLED" ]]; then
    ln -s "$SITE_AVAILABLE" "$SITE_ENABLED"
  fi
}

validate_nginx() {
  nginx -t
}

reload_nginx() {
  systemctl reload nginx
}

install_bootstrap_config() {
  backup_existing_site
  install -m 0644 "$BOOTSTRAP_SOURCE" "$SITE_AVAILABLE"
  enable_site_if_needed
  validate_nginx
  reload_nginx
  log "Bootstrap HTTP config installed"
}

issue_certificate() {
  local certbot_args=(
    certonly
    --nginx
    --non-interactive
    --keep-until-expiring
    --cert-name "$PRIMARY_DOMAIN"
    -d "${DOMAINS[0]}"
    -d "${DOMAINS[1]}"
    -d "${DOMAINS[2]}"
    -d "${DOMAINS[3]}"
  )

  if [[ -n "$CERTBOT_EMAIL" ]]; then
    certbot_args+=(--agree-tos -m "$CERTBOT_EMAIL")
  elif certbot show_account >/dev/null 2>&1; then
    log "Reusing existing Certbot account without overriding email contact"
  else
    die "CERTBOT email is required when no existing Certbot account is registered"
  fi

  certbot "${certbot_args[@]}"
}

install_final_config() {
  install -m 0644 "$FINAL_SOURCE" "$SITE_AVAILABLE"
  validate_nginx
  reload_nginx
  log "Final HTTPS reverse proxy config installed"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --email)
        shift
        CERTBOT_EMAIL="${1:-}"
        [[ -n "$CERTBOT_EMAIL" ]] || die "Missing value for --email"
        ;;
      --preflight-only)
        PRECHECK_ONLY=1
        ;;
      --skip-certbot)
        SKIP_CERTBOT=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
    shift
  done

  [[ "$(id -u)" -eq 0 ]] || die "This script must run as root"
  require_command nginx
  require_command certbot
  require_command dig
  [[ -f "$BOOTSTRAP_SOURCE" ]] || die "Missing bootstrap config: $BOOTSTRAP_SOURCE"
  [[ -f "$FINAL_SOURCE" ]] || die "Missing final config: $FINAL_SOURCE"

  check_dns

  if [[ "$PRECHECK_ONLY" -eq 1 ]]; then
    log "Preflight completed"
    exit 0
  fi

  install_bootstrap_config

  if [[ "$SKIP_CERTBOT" -eq 1 ]]; then
    warn "Certbot step skipped. HTTPS is not active yet."
    exit 0
  fi

  issue_certificate
  install_final_config
}

main "$@"
