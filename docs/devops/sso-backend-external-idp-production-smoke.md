# SSO Backend External IdP Production Smoke

This runbook validates the public production surfaces required by FR-005 External
IdP support without using secrets, bearer tokens, refresh tokens, cookies, or
upstream IdP credentials.

## Script

```bash
scripts/sso-backend-external-idp-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id
```

Strict mode for environments where at least one External IdP provider must be
configured and healthy:

```bash
scripts/sso-backend-external-idp-production-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --require-configured-provider
```

## What It Validates

- Public backend URL uses HTTPS.
- Root service response exposes the production issuer.
- `/ready` exposes the `external_idps` readiness section.
- External IdP readiness includes `required_ready`, `any_ready`, totals, and
  provider list schema.
- OIDC discovery metadata is reachable because brokered login depends on issuer
  and JWKS metadata.
- `/.well-known/jwks.json` and `/jwks` return JWKS key arrays.
- Admin External IdP registry endpoint is protected from anonymous access.
- Token endpoint rejects unsupported GET requests.
- Smoke output and fetched public responses do not leak `client_secret`,
  `access_token`, `refresh_token`, `id_token`, or `code_verifier` material.

## GitHub Actions Gate

The deploy workflow runs this smoke only when the explicit variable gate is set:

```text
RUN_FR005_PRODUCTION_SMOKE=true
```

This keeps default deployments fast while allowing production External IdP smoke
verification after deploy.

## Evidence to Retain

Retain the following when validating production:

```text
command used
commit SHA
deploy workflow URL
script output showing External IdP production smoke completed successfully without secrets or tokens
/up response
/ready response
```

## Safety Notes

- Do not pass upstream IdP credentials to this smoke.
- Do not print bearer tokens, refresh tokens, ID tokens, cookies, or client
  secrets in CI logs.
- Use `--require-configured-provider` only after the production External IdP
  registry intentionally contains at least one enabled provider.
