# ZITADEL Vue Login Canary Runbook

Date: 2026-04-26

## Decision

ZITADEL Hosted Login V2 remains available as the rollback target because the
upstream Login app is officially Next.js based. The Vue path is implemented as a
separate custom Login UI canary at `/ui/v2/login-vue` and follows the ZITADEL
custom Login UI model:

1. ZITADEL parses the OIDC request.
2. ZITADEL redirects to the configured Login UI with an auth request ID.
3. The Vue Login UI creates and updates a ZITADEL session from a server-side BFF.
4. The BFF finalizes the auth request and returns the callback URL.
5. The browser returns to the requesting application.

## Why This Is Safer Than Patching Hosted Login

- The upstream hosted login bundle is not mutated into another framework.
- Vue code is source-owned, typed, testable, and scanned by CI.
- The official `@zitadel/vue` pattern is treated as a Vue SPA/OIDC client
  reference, not as the credential-collection layer for a custom Login UI.
- The ZITADEL service account token and session token stay server-side or in an
  HttpOnly signed cookie.
- The visible browser URL does not carry `loginName` or password/TOTP material.

## Runtime Paths

- Hosted rollback path: `/ui/v2/login`
- Vue canary path: `/ui/v2/login-vue`
- Active path variable: `ZITADEL_LOGIN_ACTIVE_BASE_PATH`

Default value remains:

```env
ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login
```

Canary cutover value:

```env
ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login-vue
```

## Zero-Downtime Cutover

1. Deploy `zitadel-login-vue` beside the hosted login.
2. Smoke `https://id.dev-sso.timeh.my.id/ui/v2/login-vue/healthz`.
3. Set `ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login-vue`.
4. Recreate only `zitadel-api` after health-gating the Vue login service.
5. Run OIDC login smoke tests from `dev-sso.timeh.my.id`.

## Rollback

1. Set `ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login`.
2. Recreate only `zitadel-api`.
3. Smoke `https://id.dev-sso.timeh.my.id/ui/v2/login/healthy`.
4. Keep `zitadel-login-vue` running as a canary unless it is the incident source.

## Quality Gates

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke`
- `scripts/validate-zitadel-login-vue-lifecycle.sh`
- GitHub Actions CI image build and Grype security scan

## Official References

- ZITADEL Vue example: https://github.com/zitadel/zitadel-vue
- ZITADEL Login App architecture: https://zitadel.com/docs/guides/integrate/login-ui/login-app
- ZITADEL custom OIDC Login UI: https://zitadel.com/docs/guides/integrate/login-ui/oidc-standard
- ZITADEL username/password Session API flow: https://zitadel.com/docs/guides/integrate/login-ui/username-password
- ZITADEL MFA flow: https://zitadel.com/docs/guides/integrate/login-ui/mfa
