# App A SLO Fan-out E2E

## Scope

This Playwright suite validates logout parity across App A and App B.

## Assertions

- App A can authenticate through the broker flow
- App B can authenticate through the broker flow
- logout initiated from App A reaches the broker
- broker back-channel fan-out invalidates the App B server-side session

## Required environment

- `PLAYWRIGHT_APP_A_BASE_URL`
- `PLAYWRIGHT_APP_B_BASE_URL`
- `PLAYWRIGHT_SSO_USERNAME`
- `PLAYWRIGHT_SSO_PASSWORD`

## Command

```bash
cd apps/app-a-next
npm run test:e2e:slo
```
