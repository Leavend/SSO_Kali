# FR-007 SSO Error Production Smoke

This runbook validates the production-facing SSO error handling contract after deploy.
It is intentionally safe to run without privileged credentials and without secrets or tokens.

## Command

```bash
RUN_FR007_PRODUCTION_SMOKE=true \
  scripts/sso-backend-sso-error-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --frontend-login-url https://sso.timeh.my.id/login \
  --client-id app-a \
  --redirect-uri https://sso.timeh.my.id/app-a/auth/callback
```

## Coverage

- Public liveness and readiness: `/up`, `/health`, `/ready`.
- OIDC prompt=none client redirect contract via `prompt=none`.
- Token endpoint OAuth/OIDC JSON error contract for `invalid_grant`.
- Admin SSO error template authentication boundary.
- Secret-free output assertion using `assert_no_secret_like_output`.

## Expected Outcomes

### OIDC prompt=none client redirect contract

The `/authorize` request with `prompt=none` must redirect to the registered client
`redirect_uri` with these OIDC-compatible fields:

- `error=login_required`
- original `state`

The backend must record the FR-007 `error_ref=SSOERR-*` internally via structured
logs. No raw upstream details, tokens, code verifier, or client secrets may appear.

### Token endpoint OAuth/OIDC JSON error contract

The `/token` invalid authorization-code exchange must keep the OAuth-compatible JSON
shape, including `error=invalid_grant`, while backend observability records the
FR-007 structured error internally.

### Admin SSO error template authentication boundary

`/admin/api/sso-error-templates` must require authentication and return `401` or
`403` without leaking data. This confirms the admin template management surface is
not public.

## Evidence to Retain

Retain the GitHub Actions log section named `Run FR-007 SSO error production smoke`.
The log must show the success line:

```text
FR-007 SSO error production smoke completed successfully without secrets or tokens
```

The retained evidence must be without secrets or tokens. If the script detects
secret-like output, treat it as a critical FR-007 regression and rotate any affected
credential immediately.
