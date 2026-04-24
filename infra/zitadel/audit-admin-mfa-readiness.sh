#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
ACCEPTED_AMR="${ACCEPTED_AMR:-mfa,otp,u2f}"
OUTPUT_FILE="${OUTPUT_FILE:-}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[audit-admin-mfa-readiness][ERROR] Missing command: %s\n' "$1" >&2
    exit 1
  }
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

bootstrap_pat() {
  local path
  path="$(docker volume inspect "$BOOTSTRAP_VOLUME" --format '{{.Mountpoint}}')"
  tr -d '\r\n' <"${path}/admin.pat"
}

base_url() {
  printf 'https://%s/management/v1' "$(get_env ZITADEL_DOMAIN)"
}

search_user() {
  local pat="$1"
  local base="$2"
  local username="$3"
  local body

  body="$(jq -n --arg q "$username" '{
    limit: 1,
    queries: [{ userNameQuery: { userName: $q, method: "TEXT_QUERY_METHOD_EQUALS" } }]
  }')"

  curl -ksS \
    -H "Authorization: Bearer ${pat}" \
    -H 'Content-Type: application/json' \
    -X POST "${base}/users/_search" \
    -d "$body"
}

list_auth_factors() {
  local pat="$1"
  local base="$2"
  local user_id="$3"

  curl -ksS \
    -H "Authorization: Bearer ${pat}" \
    -H 'Content-Type: application/json' \
    -X POST "${base}/users/${user_id}/auth_factors/_search" \
    -d '{}'
}

get_login_policy() {
  local pat="$1"
  local base="$2"

  curl -ksS -H "Authorization: Bearer ${pat}" "${base}/policies/login"
}

latest_login_context() {
  local subject_id="$1"

  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T -e TARGET_SUBJECT_ID="$subject_id" sso-backend php -r '
require "vendor/autoload.php";
$app = require "bootstrap/app.php";
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$subjectId = getenv("TARGET_SUBJECT_ID") ?: "";
$row = Illuminate\Support\Facades\DB::table("login_contexts")
    ->where("subject_id", $subjectId)
    ->orderByDesc("created_at")
    ->first(["subject_id", "auth_time", "amr", "acr", "created_at"]);
echo json_encode($row, JSON_UNESCAPED_SLASHES);
' </dev/null
}

csv_to_json() {
  jq -cn --arg csv "$1" '$csv | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))'
}

decision_status() {
  local policy_ready="$1"
  local factor_ready="$2"
  local claim_ready="$3"

  if [[ "$policy_ready" != "true" ]]; then
    printf 'BLOCKED_POLICY'
    return 0
  fi

  if [[ "$factor_ready" != "true" ]]; then
    printf 'BLOCKED_ENROLLMENT'
    return 0
  fi

  if [[ "$claim_ready" != "true" ]]; then
    printf 'BLOCKED_CLAIM_VALIDATION'
    return 0
  fi

  printf 'READY_FOR_CANARY'
}

main() {
  local pat base admin_emails_json policy_json users_json
  local ready_policy ready_factors ready_claims decision report summary

  require_command curl
  require_command docker
  require_command jq
  [[ -f "$ENV_FILE" ]] || {
    printf '[audit-admin-mfa-readiness][ERROR] Missing env file: %s\n' "$ENV_FILE" >&2
    exit 1
  }
  [[ -f "$COMPOSE_FILE" ]] || {
    printf '[audit-admin-mfa-readiness][ERROR] Missing compose file: %s\n' "$COMPOSE_FILE" >&2
    exit 1
  }

  pat="$(bootstrap_pat)"
  base="$(base_url)"
  admin_emails_json="$(csv_to_json "$(get_env ADMIN_PANEL_ADMIN_EMAIL)")"
  policy_json="$(get_login_policy "$pat" "$base")"

  users_json="$(
    jq -cn \
      --argjson admins "$admin_emails_json" \
      --arg pat "$pat" \
      --arg base "$base" \
      --arg env_file "$ENV_FILE" \
      --arg compose_file "$COMPOSE_FILE" \
      --arg accepted_amr "$ACCEPTED_AMR" \
      '
      $admins | map({
        email: .,
        pat: $pat,
        base: $base,
        env_file: $env_file,
        compose_file: $compose_file,
        accepted_amr: ($accepted_amr | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)))
      })
      '
  )"

  report="$(
    while IFS= read -r row; do
      email="$(printf '%s' "$row" | jq -r '.email')"
      user_json="$(search_user "$pat" "$base" "$email")"
      user_id="$(printf '%s' "$user_json" | jq -r '.result[0].id // empty')"
      subject_id="$user_id"
      factors_json='{"result":[]}'
      login_context_json='null'
      if [[ -n "$user_id" ]]; then
        factors_json="$(list_auth_factors "$pat" "$base" "$user_id")"
        login_context_json="$(latest_login_context "$subject_id")"
      fi

      jq -cn \
        --arg email "$email" \
        --argjson user "$user_json" \
        --argjson factors "$factors_json" \
        --argjson login_context "$login_context_json" \
        --arg accepted_amr "$ACCEPTED_AMR" '
        def accepted: $accepted_amr | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0));
        def factor_types: [($factors.result // [])[] | keys[]];
        def latest_amr:
          if $login_context == null then []
          else (($login_context.amr // "[]") | fromjson? // [])
          end;
        def mfa_ready:
          ([latest_amr[] | select(. != "pwd" and . != "password")] | length) > 0 and
          ((accepted | map(select(latest_amr | index(.)))) | length) > 0;
        {
          email: $email,
          user_id: ($user.result[0].id // null),
          username: ($user.result[0].userName // null),
          state: ($user.result[0].state // null),
          factor_types: factor_types,
          factor_count: (factor_types | length),
          latest_login_context: (
            if $login_context == null then null
            else {
              auth_time: ($login_context.auth_time // null),
              acr: ($login_context.acr // null),
              amr: latest_amr,
              created_at: ($login_context.created_at // null)
            }
            end
          ),
          canary_ready: mfa_ready
        }'
    done < <(printf '%s' "$users_json" | jq -c '.[]') | jq -s '.'
  )"

  ready_policy="$(
    printf '%s' "$policy_json" |
      jq -r '((.policy.secondFactors // []) | length) > 0 or ((.policy.multiFactors // []) | length) > 0'
  )"
  ready_factors="$(printf '%s' "$report" | jq -r 'map(.factor_count > 0) | any')"
  ready_claims="$(printf '%s' "$report" | jq -r 'map(.canary_ready) | any')"
  decision="$(decision_status "$ready_policy" "$ready_factors" "$ready_claims")"

  summary="$(
    jq -cn \
      --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg accepted_amr "$ACCEPTED_AMR" \
      --arg decision "$decision" \
      --argjson policy "$policy_json" \
      --argjson users "$report" \
      '{
        generated_at: $generated_at,
        decision: $decision,
        accepted_amr_candidate: ($accepted_amr | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))),
        login_policy: {
          allow_username_password: ($policy.policy.allowUsernamePassword // false),
          allow_register: ($policy.policy.allowRegister // false),
          second_factors: ($policy.policy.secondFactors // []),
          multi_factors: ($policy.policy.multiFactors // []),
          second_factor_check_lifetime: ($policy.policy.secondFactorCheckLifetime // null),
          multi_factor_check_lifetime: ($policy.policy.multiFactorCheckLifetime // null)
        },
        admins: $users,
        next_actions: (
          if $decision == "READY_FOR_CANARY" then
            [
              "Set ADMIN_PANEL_MFA_ACCEPTED_AMR to the observed second-factor claim set.",
              "Set ADMIN_PANEL_REQUIRE_MFA=true and recreate only sso-backend.",
              "Verify /admin/api/me and destructive session actions with one MFA-enrolled admin."
            ]
          elif $decision == "BLOCKED_ENROLLMENT" then
            [
              "Enroll at least one admin account in ZITADEL OTP or U2F.",
              "Perform one fresh admin login using the enrolled factor.",
              "Re-run this readiness audit before enabling ADMIN_PANEL_REQUIRE_MFA."
            ]
          else
            [
              "Verify ZITADEL login policy keeps second-factor or multi-factor methods enabled.",
              "Perform one fresh MFA-backed admin login and confirm amr contains the accepted factor.",
              "Re-run this readiness audit before enabling ADMIN_PANEL_REQUIRE_MFA."
            ]
          end
        )
      }'
  )"

  if [[ -n "$OUTPUT_FILE" ]]; then
    mkdir -p "$(dirname "$OUTPUT_FILE")"
    printf '%s\n' "$summary" >"$OUTPUT_FILE"
  else
    printf '%s\n' "$summary"
  fi
}

main "$@"
