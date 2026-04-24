# OIDC E2E via Proxy Chain

## Scope

This Playwright suite acts as the Dev-to-Staging release gate for the OIDC browser flow through the chained proxy topology.

## Assertions

- Broker discovery exposes the canonical broker endpoints.
- Upstream IdP discovery exposes the canonical ZITADEL endpoints.
- Browser navigation crosses the expected proxy-backed hops:
  - App A login start
  - broker `/authorize`
  - IdP `/oauth/v2/authorize`
  - IdP hosted login UI
  - broker `/callbacks/zitadel`
  - App A `/auth/callback`
- App A reaches the authenticated state, which proves the broker token exchange succeeded after callback.

## Required environment

- `PLAYWRIGHT_PROXY_APP_A_BASE_URL`
- `PLAYWRIGHT_PROXY_BROKER_BASE_URL`
- `PLAYWRIGHT_PROXY_IDP_BASE_URL`
- `PLAYWRIGHT_SSO_USERNAME`
- `PLAYWRIGHT_SSO_PASSWORD`
- `PLAYWRIGHT_PROXY_CLIENT_ID`
  - Optional. Defaults to `prototype-app-a`.

## Commands

```bash
cd apps/app-a-next
npm run test:e2e:proxy-chain -- --list
```

```bash
bash infra/qa/run-oidc-proxy-chain-e2e.sh
```

## Evidence

The suite attaches:

- broker OpenID configuration
- IdP OpenID configuration
- redirect trace across the proxy chain
- App A authenticated screenshot
