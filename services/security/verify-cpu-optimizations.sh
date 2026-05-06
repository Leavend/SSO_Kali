#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/services/sso-backend"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.dev.yml"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() { echo -e "${GREEN}✓${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "${RED}✗${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "${YELLOW}⚠${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

run_check() {
    local label="$1"
    shift

    if "$@" >/dev/null 2>&1; then
        check_pass "$label"
    else
        check_fail "$label"
    fi
}

contains() {
    local file="$1"
    local pattern="$2"

    grep -q -- "$pattern" "$file"
}

echo "=========================================="
echo "CPU Optimization Verification"
echo "=========================================="
echo "Project root: $PROJECT_ROOT"
echo ""

echo "1. Checking optimized files exist..."
run_check "AtomicCounterStore.php exists" test -f "$BACKEND_DIR/app/Support/Cache/AtomicCounterStore.php"
run_check "SigningKeyService has caching implemented" contains "$BACKEND_DIR/app/Services/Oidc/SigningKeyService.php" "materialCache"
run_check "CPU metrics registry exists" test -f "$BACKEND_DIR/app/Support/Performance/CpuMetricsRegistry.php"
echo ""

echo "2. Checking Docker resource and worker settings..."
run_check "Docker compose file exists" test -f "$COMPOSE_FILE"
run_check "Medium PHP CPU limit set to 0.35" contains "$COMPOSE_FILE" 'cpus: "0.35"'
run_check "Queue worker loop configured" contains "$COMPOSE_FILE" 'for worker in $(seq 1'
run_check "Queue worker count env configured" contains "$COMPOSE_FILE" 'SSO_BACKEND_QUEUE_WORKERS'
run_check "Health check interval optimized to 45s" contains "$COMPOSE_FILE" 'interval: 45s'
echo ""

echo "3. Checking monitoring endpoint wiring..."
run_check "PerformanceMetricsController exists" test -f "$BACKEND_DIR/app/Http/Controllers/System/PerformanceMetricsController.php"
run_check "Metrics endpoint configured" contains "$BACKEND_DIR/routes/web.php" '_internal/performance-metrics'
run_check "Performance middleware registered" contains "$BACKEND_DIR/bootstrap/app.php" 'TrackCpuPerformance'
echo ""

echo "4. Running optimization tests..."
if [ -x "$BACKEND_DIR/vendor/bin/pest" ]; then
    (cd "$BACKEND_DIR" && vendor/bin/pest \
        tests/Unit/Support/Cache/AtomicCounterStoreTest.php \
        tests/Unit/Services/Oidc/SigningKeyServiceCacheTest.php \
        tests/Unit/Support/Performance/CpuMetricsRegistryTest.php \
        --no-coverage >/dev/null 2>&1)
    if [ $? -eq 0 ]; then
        check_pass "Optimization unit tests pass"
    else
        check_fail "Optimization unit tests failing"
    fi
else
    check_warn "Pest binary not found; skipping unit tests"
fi
echo ""

echo "5. Verifying Docker Compose configuration..."
if command -v docker >/dev/null 2>&1; then
    COMPOSE_ENV_ARGS=()
    if [ -f "$PROJECT_ROOT/.env.dev" ]; then
        COMPOSE_ENV_ARGS=(--env-file "$PROJECT_ROOT/.env.dev")
    fi

    if (cd "$PROJECT_ROOT" && docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" config >/dev/null 2>&1); then
        check_pass "Docker Compose configuration valid"
    else
        check_fail "Docker Compose configuration invalid"
    fi
else
    check_warn "Docker CLI not found; skipping compose validation"
fi
echo ""

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${YELLOW}Warnings: $WARN_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}All critical checks passed.${NC}"
    exit 0
fi

echo -e "${RED}$FAIL_COUNT critical check(s) failed.${NC}"
exit 1
