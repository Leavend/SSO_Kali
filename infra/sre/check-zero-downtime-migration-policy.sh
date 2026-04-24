#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PHASE1_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.canary-phase1.conf"
PHASE2_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.canary-phase2.conf"
APPLY_SCRIPT="${ROOT_DIR}/infra/sre/apply-zero-downtime-phase.sh"
ROLLBACK_SCRIPT="${ROOT_DIR}/infra/sre/rollback-zero-downtime-migration.sh"
SLO_SCRIPT="${ROOT_DIR}/infra/sre/evaluate-canary-slo.sh"

require_pattern() {
  local file="$1"
  local pattern="$2"

  if ! grep -Eq "$pattern" "$file"; then
    printf '[check-zero-downtime-migration-policy][ERROR] %s missing pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$PHASE1_CONFIG" 'location = /sso'
require_pattern "$PHASE1_CONFIG" 'location \^~ /sso/'
require_pattern "$PHASE1_CONFIG" 'rewrite \^/sso\(/\.\*\)\$ \$1 break;|rewrite \^/sso\(/\.\*\)\$ \$1 break'
require_pattern "$PHASE1_CONFIG" 'proxy_pass http://sso_traefik_web;'
require_pattern "$PHASE2_CONFIG" 'server_name app-a\.timeh\.my\.id;'
require_pattern "$PHASE2_CONFIG" 'location \^~ /auth/'
require_pattern "$PHASE2_CONFIG" 'server_name app-b\.timeh\.my\.id;'
require_pattern "$PHASE2_CONFIG" 'location = /dashboard'
require_pattern "$APPLY_SCRIPT" 'phase1\)'
require_pattern "$APPLY_SCRIPT" 'phase2\)'
require_pattern "$APPLY_SCRIPT" 'cutover\)'
require_pattern "$ROLLBACK_SCRIPT" 'nginx -t'
require_pattern "$ROLLBACK_SCRIPT" 'systemctl reload nginx'
require_pattern "$SLO_SCRIPT" 'MIN_SUCCESS_RATE'
require_pattern "$SLO_SCRIPT" 'MAX_5XX_RATE'
require_pattern "$SLO_SCRIPT" 'MAX_P95_MS'

printf '[check-zero-downtime-migration-policy] OK\n'
