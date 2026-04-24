#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bootstrap ZITADEL dev resources: project, broker OIDC app, test user.
#
# Idempotent — safe to re-run.  On each invocation it will:
#   1. Verify the admin PAT is valid.
#   2. Create (or find) the prototype project.
#   3. Create (or find + rotate-secret) the broker OIDC app.
#   4. Write the real client_id / client_secret back to .env.dev.
#   5. Create a human test user (skip if already exists).
#      First creation now requires an explicit password input via env/file.
#   6. Recreate sso-backend so it picks up fresh credentials.
#   7. Smoke-test the authorize → ZITADEL redirect.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"

# --- Test-user defaults (overridable) -------------------------------------
TEST_USER_USERNAME="${TEST_USER_USERNAME:-dev@timeh.my.id}"
TEST_USER_EMAIL="${TEST_USER_EMAIL:-dev@timeh.my.id}"
TEST_USER_GIVEN="${TEST_USER_GIVEN:-Dev}"
TEST_USER_FAMILY="${TEST_USER_FAMILY:-Prototype}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-}"
TEST_USER_PASSWORD_FILE="${TEST_USER_PASSWORD_FILE:-}"

# --- Logging ---------------------------------------------------------------
log()  { printf '[bootstrap-zitadel] %s\n' "$*"; }
warn() { printf '[bootstrap-zitadel][WARN] %s\n' "$*" >&2; }
die()  { printf '[bootstrap-zitadel][ERROR] %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# --- Compose / env helpers -------------------------------------------------
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

set_env() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    $1 == key {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$ENV_FILE" >"$tmp_file"
  chmod 600 "$tmp_file" 2>/dev/null || true
  mv "$tmp_file" "$ENV_FILE"
}

wait_for_service() {
  local service="$1"
  local timeout="${2:-180}"
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

resolve_test_user_password() {
  if [[ -n "$TEST_USER_PASSWORD" ]]; then
    printf '%s' "$TEST_USER_PASSWORD"
    return 0
  fi

  if [[ -n "$TEST_USER_PASSWORD_FILE" && -f "$TEST_USER_PASSWORD_FILE" ]]; then
    tr -d '\r\n' <"$TEST_USER_PASSWORD_FILE"
    return 0
  fi

  die "Creating the bootstrap user requires TEST_USER_PASSWORD or TEST_USER_PASSWORD_FILE. Plaintext default passwords are no longer allowed."
}

# --- ZITADEL API helpers ---------------------------------------------------
api_get() {
  local path="$1"
  local tmp_body tmp_headers code
  tmp_body="$(mktemp)"
  tmp_headers="$(mktemp)"
  code="$(
    curl -sS -o "$tmp_body" -D "$tmp_headers" \
      -H "Authorization: Bearer ${PAT}" \
      -H 'Content-Type: application/json' \
      -X GET "${ZITADEL_BASE_URL}${path}" \
      -w '%{http_code}'
  )"
  if [[ "${code}" -lt 200 || "${code}" -ge 300 ]]; then
    sed -n '1,20p' "$tmp_headers" >&2
    cat "$tmp_body" >&2
    rm -f "$tmp_body" "$tmp_headers"
    return 1
  fi
  cat "$tmp_body"
  rm -f "$tmp_body" "$tmp_headers"
}

api_post() {
  local path="$1"
  local body="$2"
  local tmp_body tmp_headers code
  tmp_body="$(mktemp)"
  tmp_headers="$(mktemp)"
  code="$(
    curl -sS -o "$tmp_body" -D "$tmp_headers" \
      -H "Authorization: Bearer ${PAT}" \
      -H 'Content-Type: application/json' \
      -X POST "${ZITADEL_BASE_URL}${path}" \
      -d "$body" \
      -w '%{http_code}'
  )"
  if [[ "${code}" -lt 200 || "${code}" -ge 300 ]]; then
    sed -n '1,20p' "$tmp_headers" >&2
    cat "$tmp_body" >&2
    rm -f "$tmp_body" "$tmp_headers"
    die "API request failed for ${path} (HTTP ${code})"
  fi
  cat "$tmp_body"
  rm -f "$tmp_body" "$tmp_headers"
}

# --- Non-fatal POST (returns HTTP code, body on stdout) --------------------
api_post_maybe() {
  local path="$1"
  local body="$2"
  local tmp_body code
  tmp_body="$(mktemp)"
  code="$(
    curl -sS -o "$tmp_body" \
      -H "Authorization: Bearer ${PAT}" \
      -H 'Content-Type: application/json' \
      -X POST "${ZITADEL_BASE_URL}${path}" \
      -d "$body" \
      -w '%{http_code}'
  )"
  cat "$tmp_body"
  rm -f "$tmp_body"
  return 0
}

# ---------------------------------------------------------------------------
#  Main
# ---------------------------------------------------------------------------
main() {
  require_command curl
  require_command jq
  require_command docker
  require_command openssl

  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(get_env COMPOSE_PROJECT_NAME)}"
  ZITADEL_DOMAIN="$(get_env ZITADEL_DOMAIN)"
  ZITADEL_BASE_URL="https://${ZITADEL_DOMAIN}"
  PROJECT_NAME="$(get_env ZITADEL_PROTOTYPE_PROJECT_NAME)"
  APP_NAME="$(get_env ZITADEL_BROKER_APP_NAME)"
  REDIRECT_URI="$(get_env ZITADEL_BROKER_REDIRECT_URI)"
  SSO_BASE_URL="$(get_env SSO_BASE_URL)"
  SSO_DOMAIN="$(get_env SSO_DOMAIN)"
  APP_A_REDIRECT_URI="$(get_env APP_A_REDIRECT_URI)"
  APP_A_CLIENT_ID="$(get_env APP_A_CLIENT_ID)"

  [[ -n "$COMPOSE_PROJECT_NAME" ]] || die "Missing COMPOSE_PROJECT_NAME"
  [[ -n "$ZITADEL_DOMAIN" ]] || die "Missing ZITADEL_DOMAIN"
  [[ -n "$PROJECT_NAME" ]] || die "Missing ZITADEL_PROTOTYPE_PROJECT_NAME"
  [[ -n "$APP_NAME" ]] || die "Missing ZITADEL_BROKER_APP_NAME"
  [[ -n "$REDIRECT_URI" ]] || die "Missing ZITADEL_BROKER_REDIRECT_URI"
  [[ -n "$SSO_BASE_URL" ]] || die "Missing SSO_BASE_URL"

  # ---- 1. Read PAT -------------------------------------------------------
  BOOTSTRAP_DIR="$(docker volume inspect "$BOOTSTRAP_VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true)"
  [[ -n "$BOOTSTRAP_DIR" ]] || die "Bootstrap volume not found: $BOOTSTRAP_VOLUME"
  [[ -f "${BOOTSTRAP_DIR}/admin.pat" ]] || die "Missing admin PAT at ${BOOTSTRAP_DIR}/admin.pat"
  PAT="$(tr -d '\r\n' <"${BOOTSTRAP_DIR}/admin.pat")"
  [[ -n "$PAT" ]] || die "Admin PAT is empty"
  log "Admin PAT loaded (${#PAT} chars)"

  # ---- 2. Pre-flight: verify PAT -----------------------------------------
  log "Verifying PAT against ZITADEL Management API"
  org_json="$(api_get "/management/v1/orgs/me" || true)"
  if [[ -z "$org_json" ]]; then
    die "PAT verification failed. The admin PAT cannot access /management/v1/orgs/me at ${ZITADEL_BASE_URL}. Check that ZITADEL is healthy and reachable, and that the bootstrap volume contains a valid PAT."
  fi
  org_name="$(printf '%s' "$org_json" | jq -r '.org.name // "unknown"')"
  log "PAT is valid. Organization: ${org_name}"

  # ---- 3. Find or create project -----------------------------------------
  log "Looking up project '${PROJECT_NAME}'"
  projects_json="$(api_post "/management/v1/projects/_search" '{}')"
  project_id="$(printf '%s' "$projects_json" | jq -r --arg name "$PROJECT_NAME" '.result[]? | select(.name == $name) | .id' | head -n1)"

  if [[ -z "$project_id" ]]; then
    log "Creating project '${PROJECT_NAME}'"
    project_body="$(jq -n --arg name "$PROJECT_NAME" '{name: $name, projectRoleAssertion: false, projectRoleCheck: false, hasProjectCheck: false}')"
    project_json="$(api_post "/management/v1/projects" "$project_body")"
    project_id="$(printf '%s' "$project_json" | jq -r '.id')"
    log "Project created: ${project_id}"
  else
    log "Project already exists: ${project_id}"
  fi
  [[ -n "$project_id" && "$project_id" != "null" ]] || die "Failed to determine project ID"

  # ---- 4. Find or create broker OIDC app ----------------------------------
  log "Looking up app '${APP_NAME}' in project ${project_id}"
  apps_json="$(api_post "/management/v1/projects/${project_id}/apps/_search" '{}')"
  app_json="$(printf '%s' "$apps_json" | jq -c --arg name "$APP_NAME" '.result[]? | select(.name == $name)' | head -n1)"
  app_id=""
  client_id=""
  client_secret=""

  if [[ -n "$app_json" ]]; then
    app_id="$(printf '%s' "$app_json" | jq -r '.id')"
    client_id="$(printf '%s' "$app_json" | jq -r '.oidcConfig.clientId // empty')"
    log "App already exists (ID: ${app_id}, clientId: ${client_id}). Rotating client secret."
    secret_json="$(api_post "/management/v1/projects/${project_id}/apps/${app_id}/oidc_config/_generate_client_secret" '{}')"
    client_secret="$(printf '%s' "$secret_json" | jq -r '.clientSecret')"
  else
    log "Creating broker app '${APP_NAME}'"
    app_body="$(
      jq -n \
        --arg projectId "$project_id" \
        --arg name "$APP_NAME" \
        --arg redirectUri "$REDIRECT_URI" \
        --arg postLogoutRedirectUri "$SSO_BASE_URL/" \
        '{
          projectId: $projectId,
          name: $name,
          redirectUris: [$redirectUri],
          responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
          grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
          appType: "OIDC_APP_TYPE_WEB",
          authMethodType: "OIDC_AUTH_METHOD_TYPE_POST",
          postLogoutRedirectUris: [$postLogoutRedirectUri],
          version: "OIDC_VERSION_1_0",
          devMode: false,
          accessTokenType: "OIDC_TOKEN_TYPE_BEARER"
        }'
    )"
    app_create_json="$(api_post "/management/v1/projects/${project_id}/apps/oidc" "$app_body")"
    app_id="$(printf '%s' "$app_create_json" | jq -r '.appId')"
    client_id="$(printf '%s' "$app_create_json" | jq -r '.clientId')"
    client_secret="$(printf '%s' "$app_create_json" | jq -r '.clientSecret')"
    log "App created: ${app_id}"
  fi

  [[ -n "$app_id" && "$app_id" != "null" ]] || die "Failed to determine app ID"
  [[ -n "$client_id" && "$client_id" != "null" ]] || die "Failed to determine client ID"
  [[ -n "$client_secret" && "$client_secret" != "null" ]] || die "Failed to determine client secret"

  log "Broker app ready — clientId: ${client_id}"

  # ---- 5. Write credentials to .env.dev ----------------------------------
  set_env "ZITADEL_BROKER_CLIENT_ID" "$client_id"
  set_env "ZITADEL_BROKER_CLIENT_SECRET" "$client_secret"
  log "Updated ZITADEL_BROKER_CLIENT_ID and ZITADEL_BROKER_CLIENT_SECRET in ${ENV_FILE}"

  # ---- 6. Create test human user (idempotent, v2 API) ----------------------
  log "Looking up test user '${TEST_USER_USERNAME}'"
  user_search_body="$(jq -n --arg q "$TEST_USER_USERNAME" '{
    query: { offset: "0", limit: 100 },
    queries: [{ userNameQuery: { userName: $q, method: "TEXT_QUERY_METHOD_EQUALS" } }]
  }')"
  user_search_json="$(api_post "/management/v1/users/_search" "$user_search_body")"
  existing_user_id="$(printf '%s' "$user_search_json" | jq -r '.result[0]?.id // empty')"
  existing_user_state="$(printf '%s' "$user_search_json" | jq -r '.result[0]?.state // empty')"

  if [[ -n "$existing_user_id" && "$existing_user_state" == "USER_STATE_ACTIVE" ]]; then
    log "Test user already exists and is ACTIVE (ID: ${existing_user_id}). Skipping."
  else
    # If user exists but is stuck in INITIAL, delete and recreate via v2
    if [[ -n "$existing_user_id" && "$existing_user_state" == "USER_STATE_INITIAL" ]]; then
      log "Test user exists but stuck in INITIAL state. Deleting and recreating via v2 API."
      api_post "/management/v1/users/${existing_user_id}" '{}' >/dev/null 2>&1 || \
        curl -sS -H "Authorization: Bearer ${PAT}" -X DELETE \
          "${ZITADEL_BASE_URL}/management/v1/users/${existing_user_id}" >/dev/null 2>&1 || true
      sleep 1
    fi

    test_user_password="$(resolve_test_user_password)"
    log "Creating test user '${TEST_USER_USERNAME}' via v2 API"
    user_body="$(jq -n \
      --arg username "$TEST_USER_USERNAME" \
      --arg email "$TEST_USER_EMAIL" \
      --arg givenName "$TEST_USER_GIVEN" \
      --arg familyName "$TEST_USER_FAMILY" \
      --arg password "$test_user_password" \
      '{
        username: $username,
        profile: {
          givenName: $givenName,
          familyName: $familyName,
          displayName: ($givenName + " " + $familyName)
        },
        email: {
          email: $email,
          isVerified: true
        },
        password: {
          password: $password,
          changeRequired: false
        }
      }')"

    user_create_json="$(api_post "/v2/users/human" "$user_body")"
    new_user_id="$(printf '%s' "$user_create_json" | jq -r '.userId // empty')"
    if [[ -n "$new_user_id" && "$new_user_id" != "null" ]]; then
      log "Test user created via v2 (ID: ${new_user_id})"
      # Verify state is ACTIVE
      user_state="$(api_get "/management/v1/users/${new_user_id}" | jq -r '.user.state // empty' 2>/dev/null || true)"
      if [[ "$user_state" == "USER_STATE_ACTIVE" ]]; then
        log "Test user state confirmed: ACTIVE ✅"
      else
        warn "Test user state: ${user_state:-unknown}. User may need manual activation."
      fi
    else
      warn "Test user creation returned unexpected response."
      printf '%s\n' "$user_create_json" >&2
    fi
  fi

  # ---- 7. Recreate sso-backend with fresh credentials ---------------------
  log "Recreating sso-backend so broker credentials are loaded"
  compose up -d --no-deps --force-recreate sso-backend
  wait_for_service sso-backend 240

  # ---- 7.5. Run migration + assign admin role to dev@timeh.my.id ----------
  log "Running sso-backend migrations"
  compose exec -T sso-backend php artisan migrate --force 2>&1 || warn "Migration may have already been applied"
  sleep 2

  ADMIN_EMAIL="$(get_env ADMIN_PANEL_ADMIN_EMAIL)"
  if [[ -n "$ADMIN_EMAIL" ]]; then
    log "Assigning admin role to ${ADMIN_EMAIL}"
    compose exec -T sso-backend php artisan admin:assign-role "$ADMIN_EMAIL" 2>&1 || \
      warn "Admin role assignment deferred — user may not exist yet. Login once, then re-run."
  fi

  # ---- 8. Smoke test: authorize redirect ----------------------------------
  log "Running authorize → ZITADEL redirect smoke test"
  sleep 3

  # Build a valid code_challenge from a random verifier
  verifier="$(openssl rand -hex 32)"
  challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"

  smoke_url="https://${SSO_DOMAIN}/authorize?$(python3 -c "
import urllib.parse
params = {
    'client_id': '${APP_A_CLIENT_ID}',
    'redirect_uri': '${APP_A_REDIRECT_URI}',
    'response_type': 'code',
    'scope': 'openid profile email',
    'state': 'smoke-test',
    'code_challenge': '${challenge}',
    'code_challenge_method': 'S256',
}
print(urllib.parse.urlencode(params))
" 2>/dev/null || echo "client_id=${APP_A_CLIENT_ID}&redirect_uri=${APP_A_REDIRECT_URI}&response_type=code&scope=openid+profile+email&state=smoke-test&code_challenge=${challenge}&code_challenge_method=S256")"

  smoke_code="$(curl -sS -o /dev/null -w '%{http_code}' -L --max-redirs 0 "$smoke_url" || true)"
  smoke_location="$(curl -sS -o /dev/null -D - -L --max-redirs 0 "$smoke_url" 2>/dev/null | grep -i '^location:' | head -1 | tr -d '\r' || true)"

  if [[ "$smoke_code" == "302" ]] && echo "$smoke_location" | grep -q "id.dev-sso.timeh.my.id"; then
    log "✅ Smoke test PASSED — authorize redirects to ZITADEL (HTTP ${smoke_code})"
    log "   Location: $(echo "$smoke_location" | head -c 120)..."
  elif [[ "$smoke_code" == "302" ]]; then
    warn "Authorize returned 302 but redirect target unexpected:"
    printf '   %s\n' "$smoke_location" >&2
  else
    warn "Smoke test returned HTTP ${smoke_code} (expected 302). The broker app may not be correctly recognized yet."
    warn "This can happen if ZITADEL caches are still warming. Wait 30s and retry:"
    warn "  curl -sS -o /dev/null -w '%{http_code}\n' -L --max-redirs 0 '${smoke_url}'"
  fi

  # ---- 9. Smoke test: Admin Panel Frontend --------------------------------
  log "Checking Admin Panel frontend at https://${SSO_DOMAIN}/"
  admin_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://${SSO_DOMAIN}/" || true)"
  admin_body="$(curl -sS --max-time 10 "https://${SSO_DOMAIN}/" 2>/dev/null | head -c 200 || true)"

  if [[ "$admin_code" =~ ^2 ]] && echo "$admin_body" | grep -qi "admin"; then
    log "✅ Admin Panel PASSED — HTML returned with admin content (HTTP ${admin_code})"
  elif [[ "$admin_code" =~ ^2 ]]; then
    log "⚠ Admin Panel returned HTTP ${admin_code} but content may not be the admin UI"
  else
    warn "❌ Admin Panel returned HTTP ${admin_code:-000}. Check sso-frontend container."
  fi

  # ---- Summary ------------------------------------------------------------
  echo
  log "===== Bootstrap Summary ====="
  log "Project:        ${PROJECT_NAME} (${project_id})"
  log "Broker App:     ${APP_NAME} (${app_id})"
  log "Client ID:      ${client_id}"
  log "Test User:      ${TEST_USER_USERNAME}"
  log "Admin Email:    ${ADMIN_EMAIL:-not set}"
  log "Env File:       ${ENV_FILE}"
  log ""
  log "Next steps:"
  log "  1. Open https://app-a.timeh.my.id in a browser"
  log "  2. Click Login → redirects to ZITADEL"
  log "  3. Login with ${TEST_USER_USERNAME} and the password you explicitly set"
  log "  4. Should callback successfully to App A"
  log ""
  log "  5. Open https://${SSO_DOMAIN} for the Admin Panel"
  log "  6. Login with ${ADMIN_EMAIL:-dev@timeh.my.id} (must have admin role)"
  log "============================="
}

main "$@"
