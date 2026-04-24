# Runbook: Forwarded Header E2E Probes

## Goal

Validate that public OIDC URLs survive the chained proxy path without host or scheme corruption.

## Probe scripts

- Config policy check:
  - [check-forwarded-header-policy.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-forwarded-header-policy.sh)
- Auth redirect probe:
  - [probe-forwarded-auth-chain.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/probe-forwarded-auth-chain.sh)

## What the probe validates

1. Broker discovery document publishes the public broker issuer.
2. Broker discovery endpoints point to the public broker host.
3. IDP discovery document publishes the public IDP issuer.
4. `/authorize` redirects to the public ZITADEL authorize endpoint.
5. Upstream `redirect_uri` remains the public broker callback URL.
6. The next redirect lands on the public login UI host.

## Staging commands

```bash
./infra/sre/check-forwarded-header-policy.sh
./infra/sre/probe-forwarded-auth-chain.sh
```

Optional custom targets:

```bash
BASE_URL=https://dev-sso.timeh.my.id \
IDP_URL=https://id.dev-sso.timeh.my.id \
CLIENT_ID=prototype-app-a \
CALLBACK_URL=https://app-a.timeh.my.id/auth/callback \
./infra/sre/probe-forwarded-auth-chain.sh
```

## Failure interpretation

- Broker discovery host mismatch:
  - likely `sso.base_url` drift or broken proxy host forwarding
- First hop redirect host mismatch:
  - likely broker metadata or proxy host corruption
- `redirect_uri` mismatch:
  - likely forwarded proto/host drift between public ingress and broker
- Second hop login UI mismatch:
  - likely ZITADEL login app public host/header drift

## On-call action

1. Check Nginx forwarded-header snippet deployment.
2. Check Traefik `trustedIPs` loopback boundary.
3. Inspect broker logs for `[FORWARDED_HEADER_MISMATCH]`.
4. If the chain is broken after a change window, use the rollback process from [rollback-runbook-vps-coexistence.md](/Users/leavend/Desktop/Project_SSO/docs/runbooks/rollback-runbook-vps-coexistence.md).
