# FR-004 Production Smoke Harness

This runbook verifies the public OIDC backend protocol surface after deploy.
It is intentionally secret-free and safe to run from GitHub Actions or an
operator terminal.

## Purpose

Validate FR-004 production readiness for:

```text
OIDC discovery metadata
JWKS publication
/token and /revocation method hardening
/userinfo bearer-token protection
prompt=none non-interactive failure semantics
invalid prompt rejection
```

## Domains

```text
Backend API: https://api-sso.timeh.my.id
Frontend UI: https://sso.timeh.my.id
```

## Command

```bash
scripts/sso-backend-fr004-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --client-id app-a \
  --redirect-uri https://sso.timeh.my.id/auth/callback
```

## GitHub Actions Usage

The deploy workflow runs this smoke after `Execute deploy on VPS` when:

```text
RUN_FR004_PRODUCTION_SMOKE=true
```

The smoke has no client secret input and must never print tokens, cookies,
refresh tokens, client secrets, or production `.env` values.

## Expected Results

```text
discovery issuer contract OK
jwks keys contract OK
token endpoint rejects GET OK
revocation endpoint rejects GET OK
userinfo without bearer is protected OK
authorize prompt=none redirect includes error=login_required
authorize invalid prompt redirect includes error=invalid_request
FR-004 production smoke completed successfully without secrets or tokens
```

## Evidence to Retain

- Git commit SHA or deployment tag.
- GitHub Actions run URL or terminal timestamp.
- Script output.
- Public base URL used.
- Confirmation that no secrets or tokens were used.

## Failure Handling

- Discovery issuer mismatch: fix `SSO_ISSUER` / public base URL in `.env.prod`.
- JWKS failure: inspect signing key config and metadata cache path.
- `/userinfo` not protected: inspect bearer-token guard and route middleware.
- `prompt=none` missing `login_required`: inspect authorization prompt handling.
- Invalid prompt not rejected: inspect authorization request validation.
- Network timeout: inspect DNS, Nginx reverse proxy, VPS firewall, or GitHub runner
  reachability before changing application code.
