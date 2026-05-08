# SSO Backend Production Public-Domain Smoke

This runbook verifies the public SSO Backend domain after deploy or topology
changes.

No secrets are required for this smoke. Do not paste tokens, cookies, client
secrets, or production `.env` values into reports.

## Domains

```text
Backend API: https://api-sso.timeh.my.id
Frontend UI: https://sso.timeh.my.id
```

## Smoke Command

```bash
scripts/sso-backend-public-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --frontend-base-url https://sso.timeh.my.id
```

Require frontend reachability only when validating the UI edge too:

```bash
scripts/sso-backend-public-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --frontend-base-url https://sso.timeh.my.id \
  --require-frontend
```

## Verified Backend Endpoints

```text
GET /up
GET /health
GET /ready
GET /.well-known/openid-configuration
GET /.well-known/jwks.json
GET /jwks
```

Expected result:

```text
HTTP 200
```

## Metadata Contract

Discovery must advertise the public backend issuer:

```text
issuer=https://api-sso.timeh.my.id
jwks_uri=https://api-sso.timeh.my.id/.well-known/jwks.json
```

Discovery and JWKS responses must include public cache headers so high-volume
metadata reads do not overload PHP workers.

## Evidence to retain

- Command timestamp.
- Git commit or deployment tag.
- Script output.
- Any failing endpoint URL and status code.
- Confirmation that no secrets were used or captured.

## Failure Handling

- If `/up` fails, inspect Nginx or edge routing first.
- If `/health` fails but `/up` passes, inspect Laravel runtime.
- If `/ready` fails, inspect database and Redis readiness.
- If discovery or JWKS fails, inspect OIDC key material and route cache.
- If issuer does not equal `https://api-sso.timeh.my.id`, fix `.env.prod`
  issuer/base URL settings before running OAuth E2E.
