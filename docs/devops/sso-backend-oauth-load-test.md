# SSO Backend Valid OAuth Token-Flow Load Test Runbook

## Goal

Validate the SSO backend token lifecycle with a dedicated load-test client without using real user sessions or production app clients.

This runbook is intentionally secret-free. Do not commit client secrets, user passwords, authorization codes, access tokens, refresh tokens, or cookies.

## Safety Gates

- Use a dedicated production load-test client.
- Use a dedicated test user or non-human client flow.
- Keep test windows short and announced.
- Start low rate before increasing concurrency.
- Revoke issued refresh tokens after the test.
- Monitor `/ready`, container stats, queue depth, and logs.

## Dedicated Client Requirements

Recommended client metadata:

```text
client_id: sso-load-test-client
client_type: confidential
redirect_uri: https://api-sso.timeh.my.id/_load-test/callback-disabled
scopes: openid profile email offline_access
backchannel_logout_uri: null or controlled internal test receiver
post_logout_redirect_uri: https://api-sso.timeh.my.id/up
```

The redirect URI should not point to a real app callback unless the app is part of the test.

## Test Profiles

### Profile 1 — Negative Token Endpoint Stability

Safe in production with malformed payloads.

```bash
wrk -t1 -c5 -d30s --latency https://api-sso.timeh.my.id/token
```

Expected:

- no `500`,
- stable latency,
- expected `400`/`401` responses.

### Profile 2 — Client Authentication Contract

Use a script that sends valid `client_id` and invalid/rotated secret only in a controlled window.

Expected:

- `401 invalid_client`,
- no lockup,
- no secret leaks in logs.

### Profile 3 — Valid Authorization Code Exchange

Requires a test harness that obtains fresh authorization codes before each exchange. Do not reuse authorization codes.

Expected:

- token endpoint returns `200`,
- code replay returns failure,
- refresh token rotation remains consistent.

### Profile 4 — Refresh Token Rotation

Use low concurrency first.

Expected:

- old refresh token is invalid after rotation,
- new refresh token works,
- no duplicate valid refresh token chains.

## Observability Checklist

During the test, monitor:

```bash
curl -fsS https://api-sso.timeh.my.id/ready
ssh tio@145.79.15.8 'docker stats --no-stream | grep sso-backend-prod'
ssh tio@145.79.15.8 'cd /opt/sso-backend-prod && docker compose --env-file .env.prod -f docker-compose.sso-backend.yml logs --since 10m sso-backend | grep -E " 500 |ERROR|CRITICAL|Exception" | tail -50'
```

## Cleanup

After the test:

1. Revoke issued refresh tokens.
2. Clear load-test sessions.
3. Review audit logs.
4. Confirm `/ready` remains green.
5. Remove or rotate the load-test client secret if it was exposed to test tooling.

## Pass Criteria

- No backend `500` responses.
- No container restart.
- `/ready` remains `ready=true`.
- Token errors are expected OAuth/OIDC errors.
- Logs contain no secrets/tokens.
- Refresh token rotation invariants hold.
