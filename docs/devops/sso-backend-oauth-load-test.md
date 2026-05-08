# SSO Backend OAuth Load-Test Client Runbook

This runbook defines the dedicated OAuth token-flow load-test client used for
safe production performance exercises.

## Security Contract

- The load-test client is disabled by default.
- Enable it only for planned load-test windows.
- The client uses the `client_credentials` grant as a confidential client.
- Never commit a plaintext `client_secret` to git.
- Store plaintext `SSO_LOAD_TEST_CLIENT_SECRET` only in the load-test runner or
  GitHub Actions secrets.
- Store only `SSO_LOAD_TEST_CLIENT_SECRET_HASH` on the SSO backend.

## Required Backend Environment

```env
SSO_LOAD_TEST_CLIENT_ENABLED=true
SSO_LOAD_TEST_CLIENT_ID=sso-load-test-client
SSO_LOAD_TEST_CLIENT_SECRET_HASH=<argon2id-hash-from-operator-workstation>
SSO_LOAD_TEST_REDIRECT_URI=https://load-test.timeh.my.id/oauth/callback
SSO_LOAD_TEST_POST_LOGOUT_REDIRECT_URI=https://load-test.timeh.my.id/signed-out
SSO_LOAD_TEST_BACKCHANNEL_LOGOUT_URI=
```

## Secret Generation

Generate the plaintext secret outside git:

```bash
openssl rand -base64 48
```

Generate the Argon2id hash on an operator workstation or one-off protected
runtime shell:

```bash
php -r 'echo password_hash(getenv("SSO_LOAD_TEST_CLIENT_SECRET"), PASSWORD_ARGON2ID).PHP_EOL;'
```

Only the hash goes to backend production env as
`SSO_LOAD_TEST_CLIENT_SECRET_HASH`.

## Token-Flow Smoke Test

Run from a trusted runner that has `SSO_LOAD_TEST_CLIENT_SECRET` injected as a
secret:

```bash
curl -sS -X POST https://api-sso.timeh.my.id/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=sso-load-test-client' \
  --data-urlencode "client_secret=${SSO_LOAD_TEST_CLIENT_SECRET}"
```

Expected result:

```text
HTTP 200
access_token present
token_type Bearer
expires_in present
```

## Load-Test Safety Checklist

- Confirm `APP_DEBUG=false`.
- Confirm `SSO_LOAD_TEST_CLIENT_ENABLED=true` only during the window.
- Confirm rate limits and queue/DB metrics dashboards are monitored.
- Use `SSO_LOAD_TEST_CLIENT_SECRET` from runner secrets only.
- Do not include access tokens, refresh tokens, cookies, or secrets in shared
  reports.
- Disable the client after testing by setting
  `SSO_LOAD_TEST_CLIENT_ENABLED=false` and redeploying.

## Evidence To Retain

- Test window start/end time.
- Runner host or GitHub Actions run ID.
- RPS/latency summary.
- Error-rate summary.
- Confirmation that no plaintext secret was committed.
