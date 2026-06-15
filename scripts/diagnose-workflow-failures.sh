#!/usr/bin/env bash
# Diagnose workflow failures without needing GitHub Actions logs
# Run this locally to validate setup before deploying

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() { echo -e "${GREEN}✓${NC} $1"; }
log_fail() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "=== Workflow Readiness Diagnostic ==="
echo

# 1. Check required files
echo "Checking required files..."
required_files=(
  ".github/workflows/deploy-main.yml"
  ".github/workflows/ci.yml"
  "docker-compose.main.yml"
  "services/sso-backend/Dockerfile"
  "services/sso-admin-frontend/Dockerfile"
)

for file in "${required_files[@]}"; do
  if [[ -f "$file" ]]; then
    log_pass "Found: $file"
  else
    log_fail "Missing: $file"
  fi
done
echo

# 2. Check Docker configuration
echo "Checking Docker configuration..."
if command -v docker &> /dev/null; then
  log_pass "Docker is installed"
  docker --version
else
  log_fail "Docker is not installed"
fi
echo

# 3. Validate docker-compose.main.yml syntax
echo "Validating docker-compose.main.yml..."
if docker compose -f docker-compose.main.yml config > /dev/null 2>&1; then
  log_pass "docker-compose.main.yml is valid"
else
  log_fail "docker-compose.main.yml has syntax errors"
  docker compose -f docker-compose.main.yml config
fi
echo

# 4. Check Dockerfiles
echo "Checking Dockerfiles..."
dockerfiles=(
  "services/sso-backend/Dockerfile"
  "services/sso-admin-frontend/Dockerfile"
)

for dockerfile in "${dockerfiles[@]}"; do
  if [[ -f "$dockerfile" ]]; then
    if grep -q "FROM " "$dockerfile"; then
      log_pass "$dockerfile has valid FROM statement"
    else
      log_fail "$dockerfile missing FROM statement"
    fi
  fi
done
echo

# 5. Check backend tests
echo "Checking backend tests..."
if [[ -d "services/sso-backend/tests" ]]; then
  test_count=$(find services/sso-backend/tests -name "*Test.php" | wc -l)
  log_pass "Found $test_count backend test files"
else
  log_fail "No backend tests directory found"
fi
echo

# 6. Check frontend tests
echo "Checking frontend tests..."
if [[ -d "services/sso-admin-frontend/tests" ]]; then
  test_count=$(find services/sso-admin-frontend -name "*.spec.ts" -o -name "*.test.ts" | wc -l)
  log_pass "Found $test_count frontend test files"
else
  log_warn "No frontend tests directory found (check package.json for test location)"
fi
echo

# 7. Check git status
echo "Checking git status..."
if [[ -d ".git" ]]; then
  uncommitted=$(git status --short | wc -l)
  if [[ $uncommitted -eq 0 ]]; then
    log_pass "No uncommitted changes"
  else
    log_warn "Found $uncommitted uncommitted changes"
    git status --short | head -5
  fi
else
  log_fail "Not in a git repository"
fi
echo

# 8. Check commit message format
echo "Checking recent commit message format..."
last_commit=$(git log -1 --format=%B 2>/dev/null || echo "")
if echo "$last_commit" | grep -Eq "^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:"; then
  log_pass "Last commit uses conventional format: ${last_commit%% *}"
else
  log_warn "Last commit may not use conventional format"
fi
echo

# 9. Environment variables
echo "Checking required environment variables (from workflows)..."
required_env_vars=(
  "VPS_HOST"
  "VPS_USER"
  "VPS_SSH_KEY"
)

for var in "${required_env_vars[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    log_pass "$var is set"
  else
    log_warn "$var is not set locally (check GitHub secrets)"
  fi
done
echo

# 10. Test build locally (optional)
echo "Workflow readiness diagnostic complete."
echo
echo "Next steps:"
echo "1. Verify all GitHub secrets are configured (VPS_HOST, VPS_SSH_KEY, etc.)"
echo "2. Run: npm run build (for frontend)"
echo "3. Run: composer install && vendor/bin/pest (for backend)"
echo "4. Manually test deployment to VPS using vps-deploy-main.sh"
echo "5. Check GitHub Actions logs at: https://github.com/leavend/Project_SSO/actions"
