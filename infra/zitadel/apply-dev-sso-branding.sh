#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
ASSET_DIR="${ASSET_DIR:-$ROOT_DIR/infra/zitadel-login/assets}"
LOGO_LIGHT_FILE="${LOGO_LIGHT_FILE:-$ASSET_DIR/dev-sso-wordmark-light.svg}"
LOGO_DARK_FILE="${LOGO_DARK_FILE:-$ASSET_DIR/dev-sso-wordmark-dark.svg}"
ICON_LIGHT_FILE="${ICON_LIGHT_FILE:-$ASSET_DIR/dev-sso-mark.svg}"
ICON_DARK_FILE="${ICON_DARK_FILE:-$ASSET_DIR/dev-sso-mark.svg}"
PRIMARY_COLOR="${PRIMARY_COLOR:-#1D4ED8}"
WARN_COLOR="${WARN_COLOR:-#DC2626}"
BACKGROUND_COLOR="${BACKGROUND_COLOR:-#F4F7FB}"
FONT_COLOR="${FONT_COLOR:-#0F172A}"
PRIMARY_COLOR_DARK="${PRIMARY_COLOR_DARK:-#2563EB}"
WARN_COLOR_DARK="${WARN_COLOR_DARK:-#F87171}"
BACKGROUND_COLOR_DARK="${BACKGROUND_COLOR_DARK:-#0F172A}"
FONT_COLOR_DARK="${FONT_COLOR_DARK:-#E2E8F0}"
THEME_MODE="${THEME_MODE:-THEME_MODE_AUTO}"
HIDE_LOGIN_NAME_SUFFIX="${HIDE_LOGIN_NAME_SUFFIX:-true}"
DISABLE_WATERMARK="${DISABLE_WATERMARK:-true}"

log() {
  printf '[apply-dev-sso-branding] %s\n' "$*"
}

die() {
  printf '[apply-dev-sso-branding][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

bootstrap_dir() {
  docker volume inspect "$BOOTSTRAP_VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true
}

load_pat() {
  local dir
  dir="$(bootstrap_dir)"
  [[ -n "$dir" ]] || die "Bootstrap volume not found: $BOOTSTRAP_VOLUME"
  [[ -f "${dir}/admin.pat" ]] || die "Missing admin PAT at ${dir}/admin.pat"
  tr -d '\r\n' <"${dir}/admin.pat"
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp_body tmp_code
  tmp_body="$(mktemp)"
  local curl_args=(
    -ksS
    -o "$tmp_body"
    -w '%{http_code}'
    -H "Authorization: Bearer ${PAT}"
    -H 'Content-Type: application/json'
    -X "$method"
    "${ZITADEL_BASE_URL}${path}"
  )
  [[ -n "$body" ]] && curl_args+=(-d "$body")
  tmp_code="$(curl "${curl_args[@]}")"
  [[ "$tmp_code" -ge 200 && "$tmp_code" -lt 300 ]] || { cat "$tmp_body" >&2; rm -f "$tmp_body"; die "API request failed for ${path} (HTTP ${tmp_code})"; }
  cat "$tmp_body"
  rm -f "$tmp_body"
}

upload_asset() {
  local path="$1"
  local file_path="$2"
  [[ -f "$file_path" ]] || die "Asset file not found: $file_path"
  curl -ksSf \
    -H "Authorization: Bearer ${PAT}" \
    -F "file=@${file_path}" \
    "${ZITADEL_BASE_URL}${path}" >/dev/null
}

label_policy_payload() {
  jq -n \
    --arg primary "$PRIMARY_COLOR" \
    --arg warn "$WARN_COLOR" \
    --arg background "$BACKGROUND_COLOR" \
    --arg font "$FONT_COLOR" \
    --arg primaryDark "$PRIMARY_COLOR_DARK" \
    --arg warnDark "$WARN_COLOR_DARK" \
    --arg backgroundDark "$BACKGROUND_COLOR_DARK" \
    --arg fontDark "$FONT_COLOR_DARK" \
    --arg themeMode "$THEME_MODE" \
    --argjson hideSuffix "$HIDE_LOGIN_NAME_SUFFIX" \
    --argjson disableWatermark "$DISABLE_WATERMARK" \
    '{primaryColor:$primary,warnColor:$warn,backgroundColor:$background,fontColor:$font,primaryColorDark:$primaryDark,warnColorDark:$warnDark,backgroundColorDark:$backgroundDark,fontColorDark:$fontDark,themeMode:$themeMode,hideLoginNameSuffix:$hideSuffix,disableWatermark:$disableWatermark}'
}

upsert_custom_policy() {
  local current payload
  current="$(api_request GET '/management/v1/policies/label')"
  payload="$(label_policy_payload)"
  if [[ "$(printf '%s' "$current" | jq -r '.isDefault // false')" == "true" ]]; then
    api_request POST '/management/v1/policies/label' "$payload" >/dev/null
    return 0
  fi
  api_request PUT '/management/v1/policies/label' "$payload" >/dev/null
}

activate_policy() {
  api_request POST '/management/v1/policies/label/_activate' '{}' >/dev/null
}

verify_policy() {
  api_request GET '/management/v1/policies/label' | jq '{primaryColor:.policy.primaryColor,backgroundColor:.policy.backgroundColor,fontColor:.policy.fontColor,primaryColorDark:.policy.primaryColorDark,backgroundColorDark:.policy.backgroundColorDark,fontColorDark:.policy.fontColorDark,hideLoginNameSuffix:.policy.hideLoginNameSuffix,disableWatermark:.policy.disableWatermark,themeMode:.policy.themeMode,logoUrl:.policy.logoUrl,logoUrlDark:.policy.logoUrlDark,iconUrl:.policy.iconUrl,iconUrlDark:.policy.iconUrlDark}'
}

main() {
  local zitadel_domain

  require_command curl
  require_command docker
  require_command jq
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"

  PAT="${ZITADEL_PAT:-$(load_pat)}"
  zitadel_domain="$(get_env ZITADEL_DOMAIN)"
  ZITADEL_BASE_URL="https://${zitadel_domain}"
  [[ -n "$PAT" ]] || die 'Admin PAT is empty.'
  [[ -n "$zitadel_domain" ]] || die 'Missing ZITADEL_DOMAIN in env file.'

  log 'Upserting custom organization label policy preview'
  upsert_custom_policy
  log 'Uploading logo and icon assets'
  upload_asset '/assets/v1/org/policy/label/logo' "$LOGO_LIGHT_FILE"
  upload_asset '/assets/v1/org/policy/label/logo/dark' "$LOGO_DARK_FILE"
  upload_asset '/assets/v1/org/policy/label/icon' "$ICON_LIGHT_FILE"
  upload_asset '/assets/v1/org/policy/label/icon/dark' "$ICON_DARK_FILE"
  log 'Activating organization label policy'
  activate_policy
  verify_policy
}

main "$@"
