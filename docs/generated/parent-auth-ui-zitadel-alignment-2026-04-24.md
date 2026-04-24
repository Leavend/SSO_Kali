# Parent Auth UI and ZITADEL Alignment - 2026-04-24

## Scope

This change makes the Dev-SSO Vue login shell the parent UI contract for the
hosted identity experience. The shared contract lives in:

- `packages/dev-sso-parent-ui/auth-shell.mjs`
- `services/sso-frontend/src/web/components/auth/AuthShell.vue`
- `services/sso-frontend/src/web/components/auth/AuthFooter.vue`

The contract owns brand copy, legal footer links, theme toggle identity,
WCAG-checked color tokens, and identity action link helpers.

## ZITADEL Alignment

The custom ZITADEL login image now imports the same parent UI contract at build
time. The patch pipeline uses it to:

- render the same footer HTML as Dev-SSO
- inject exactly one Dev-SSO theme toggle
- remove or hide ZITADEL's native two-button light/dark switch
- reuse the Dev-SSO font stack and WCAG color tokens
- align login copy with the Vue login screen

The Docker build copies `packages/dev-sso-parent-ui` into the custom
`zitadel-login` image, so the hosted login UI cannot drift from the Vue parent
contract without failing local validators.

## Bug Fix

The Vue login button no longer remains stuck in `Loading...` after the browser
returns from hosted identity UI. The login view resets submit state on:

- `pageshow`
- `focus`
- `visibilitychange`
- an 8 second navigation fallback timer

## Lifecycle Controls

The direct VPS deploy script now supports `zitadel-login` as a first-class
service:

- immutable local tag build
- rollback snapshot tag before update
- health-gated update
- HTTPS health smoke through the local reverse proxy
- optional two-replica scale via `MIN_REPLICAS`

## Validation Evidence

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke`
- `./scripts/validate-sso-frontend-vue-lifecycle.sh`
- `./scripts/validate-devops-lifecycle.sh`
- `node infra/zitadel-login/validate-login-theme-patch.mjs`
- `node infra/zitadel-login/validate-login-copy-catalog.mjs`
- `node infra/zitadel-login/validate-login-locale-alias.mjs`
- `docker build -t sso-dev-sso-frontend:parent-ui-validate -f services/sso-frontend/Dockerfile .`
- `docker build -t sso-dev-zitadel-login:parent-ui-validate -f infra/zitadel-login/Dockerfile .`

## Rollback

Rollback remains image-tag based. The previous image is retagged as
`rollback-<deploy-tag>` before any touched service is updated. A failed build,
health gate, or smoke test exits through the rollback handler.

Strict zero downtime for this VPS stays dependent on keeping at least two
healthy replicas for user-facing web services or moving the switch to a true
blue/green/orchestrated deployment. This change prepares `zitadel-login` for
the same two-replica health-gated path already used by the Vue frontend.
