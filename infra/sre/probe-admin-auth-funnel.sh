#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-${ROOT_DIR}/test-results/admin-auth-funnel-probe}"
BASE_URL="${BASE_URL:-https://dev-sso.timeh.my.id}"
EXPORTER_METRICS_URL="${EXPORTER_METRICS_URL:-}"

mkdir -p "${REPORT_DIR}"

curl -fsSL "${BASE_URL}/" -o "${REPORT_DIR}/landing.html"
grep -q "Secure Admin Sign-In" "${REPORT_DIR}/landing.html"

curl -fsS -D "${REPORT_DIR}/login.headers" -o /dev/null "${BASE_URL}/auth/login?return_to=/sessions"
FIRST_LOCATION="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {print $2}' "${REPORT_DIR}/login.headers" | tr -d '\r')"
python3 - <<'PY' "${FIRST_LOCATION}"
from __future__ import annotations
import sys
from urllib.parse import urlparse
location = sys.argv[1]
parsed = urlparse(location)
assert parsed.path == "/authorize", f"unexpected broker authorize path: {parsed.path}"
PY

curl -fsS -D "${REPORT_DIR}/broker-authorize.headers" -o /dev/null "${FIRST_LOCATION}"
SECOND_LOCATION="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {print $2}' "${REPORT_DIR}/broker-authorize.headers" | tr -d '\r')"
python3 - <<'PY' "${SECOND_LOCATION}"
from __future__ import annotations
import sys
from urllib.parse import parse_qs, urlparse
parsed = urlparse(sys.argv[1])
query = parse_qs(parsed.query)
assert parsed.path == "/oauth/v2/authorize", f"unexpected upstream authorize path: {parsed.path}"
assert query.get("prompt") == ["login"], f"prompt=login missing: {query}"
assert query.get("max_age") == ["0"], f"max_age=0 missing: {query}"
PY

for route in access-denied invalid-credentials reauth-required; do
  curl -fsSL "${BASE_URL}/${route}" -o "${REPORT_DIR}/${route}.html"
done

if [[ -n "${EXPORTER_METRICS_URL}" ]]; then
  curl -fsSL "${EXPORTER_METRICS_URL}" -o "${REPORT_DIR}/metrics.prom"
  grep -q "sso_admin_login_started_total" "${REPORT_DIR}/metrics.prom"
  grep -q "sso_admin_reauth_required_total" "${REPORT_DIR}/metrics.prom"
fi

cat > "${REPORT_DIR}/summary.md" <<EOF
# Admin Auth Funnel Synthetic Probe

- Base URL: ${BASE_URL}
- Landing page: PASS
- Login redirect to broker authorize: PASS
- Broker re-auth redirect retains \`prompt=login\` and \`max_age=0\`: PASS
- Status pages (\`/access-denied\`, \`/invalid-credentials\`, \`/reauth-required\`): PASS
EOF

if [[ -n "${EXPORTER_METRICS_URL}" ]]; then
  cat >> "${REPORT_DIR}/summary.md" <<EOF
- Exporter metrics endpoint: PASS
EOF
fi

echo "[probe-admin-auth-funnel] OK"
