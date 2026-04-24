# OIDC Proxy Chain Evidence Pack

## Generated evidence

The CI job publishes the artifact `oidc-proxy-chain-evidence` from:

- `apps/app-a-next/test-results/**`

## Minimum contents

- Playwright JSON results
- Playwright HTML report
- attached broker discovery document
- attached IdP discovery document
- attached redirect trace
- authenticated browser screenshot

## Release usage

This evidence pack is the audit trail for the release gate `OIDC E2E via Proxy Chain`.

Promotion from Dev to Staging should be blocked if:

- the probe cannot reach the broker or IdP through the expected public hosts
- the browser flow does not return from the broker callback into App A
- the authenticated App A state is not reached
