# SSO Backend Production OAuth Token-Flow Smoke

This runbook verifies the production OAuth token endpoint using the dedicated
load-test client.

The smoke is backend-only and uses the `client_credentials` grant. It does not
require browser sessions or frontend callbacks.

## Security Contract

- No secrets are committed to git.
- The plaintext `SSO_LOAD_TEST_CLIENT_SECRET` exists only in the runner shell or
  GitHub Actions secret store.
- The backend stores only `SSO_LOAD_TEST_CLIENT_SECRET_HASH`.
- The smoke script never prints the plaintext secret or issued access token.
- The load-test client must remain disabled outside planned test windows.

## Backend Env Requirements

```env
SSO_LOAD_TEST_CLIENT_ENABLED=true
SSO_LOAD_TEST_CLIENT_ID=sso-load-test-client
SSO_LOAD_TEST_CLIENT_SECRET_HASH=<argon2id-hash>
```

## Smoke Command

Run from a trusted operator machine or protected CI runner:

```bash
SSO_LOAD_TEST_CLIENT_SECRET='<runtime-only-secret>' \
  scripts/sso-backend-oauth-token-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --client-id sso-load-test-client
```

Optional environment form:

```bash
export SSO_PUBLIC_BASE_URL=https://api-sso.timeh.my.id
export SSO_LOAD_TEST_CLIENT_ID=sso-load-test-client
export SSO_LOAD_TEST_CLIENT_SECRET='<runtime-only-secret>'
scripts/sso-backend-oauth-token-smoke.sh
```

## Verified Contract

The script verifies:

```text
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=client_credentials
client_id=sso-load-test-client
client_secret=<runtime-only-secret>
```

Expected valid response:

```text
HTTP 200
access_token present
token_type Bearer
expires_in positive integer
refresh_token absent
```

Expected invalid-secret response:

```text
HTTP 400 or 401
error in invalid_client, invalid_grant, invalid_request
```

## Evidence to Retain

- Test timestamp.
- Git commit or deployment tag.
- Script pass/fail output.
- HTTP status summary only.
- Confirmation that no secrets or access tokens were printed.

## Cleanup

After the smoke or load-test window:

```env
SSO_LOAD_TEST_CLIENT_ENABLED=false
```

Redeploy and run public smoke again:

```bash
scripts/sso-backend-public-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --frontend-base-url https://sso.timeh.my.id
```
