# FR-006 Authentication Audit Production Smoke Harness

This runbook verifies the public production surface that Authentication Audit
relies on after deploy. It is intentionally secret-free and safe to run from
GitHub Actions or an operator terminal.

## Purpose

Validate FR-006 Authentication Audit production readiness for:

```text
public liveness /up
public shallow health /health
DB/Redis readiness /ready
OIDC discovery metadata dependency
JWKS publication dependency
Admin Authentication Audit API authentication boundary
secret-free output discipline
```

## Domains

```text
Backend API: https://api-sso.timeh.my.id
Frontend UI: https://sso.timeh.my.id
```

## Command

```bash
scripts/sso-backend-authentication-audit-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id
```

Optional timeout:

```bash
scripts/sso-backend-authentication-audit-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --timeout 20
```

## GitHub Actions Usage

The deploy workflow runs this smoke after `Execute deploy on VPS` when:

```text
RUN_FR006_PRODUCTION_SMOKE=true
```

The smoke has no client secret input and must never print bearer tokens, refresh
tokens, ID tokens, cookies, client secrets, admin credentials, or production
`.env` values.

## Expected Results

```text
liveness /up OK
health /health OK
readiness /ready OK
discovery issuer contract OK
discovery authorization endpoint contract OK
discovery token endpoint contract OK
discovery jwks uri contract OK
jwks keys contract OK
admin authentication audit API requires auth OK
admin authentication audit detail API requires auth OK
readiness payload secret-free output OK
discovery payload secret-free output OK
jwks payload secret-free output OK
Authentication Audit production smoke completed successfully without secrets or tokens
```

## Evidence to Retain

- Git commit SHA or deployment tag.
- GitHub Actions run URL or terminal timestamp.
- Script output.
- Public base URL used.
- Confirmation that no secrets or tokens were used.
- Confirmation that unauthenticated admin authentication audit endpoints remain
  protected.

## Failure Handling

- `/up` or `/health` failure: inspect Nginx, container runtime, and app boot.
- `/ready` failure: inspect database/Redis readiness and app dependency wiring.
- Discovery issuer mismatch: fix `SSO_ISSUER` / public base URL in `.env.prod`.
- JWKS failure: inspect signing key config and metadata cache path.
- Admin Authentication Audit endpoint returns `200` unauthenticated: treat as
  critical RBAC/auth boundary regression and roll back or block deploy.
- Secret-like output detected: stop publishing logs, inspect endpoint payloads,
  and confirm no token, cookie, client secret, or admin credential was emitted.
- Network timeout: inspect DNS, Nginx reverse proxy, VPS firewall, or GitHub
  runner reachability before changing application code.
