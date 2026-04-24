# SSO Frontend Vue UI Restoration - 2026-04-24

## Issue

The live root UI changed after the primary SSO frontend was rebuilt from Next.js to Vue 3. The Vue implementation had replaced the previous Next login experience with a temporary "Secure operation console" layout. Because the unauthenticated app shell still used the authenticated grid column definition, the root login panel could render left-shifted on wide screens.

## Decision

Restore the previous Next login experience on the latest Vue stack instead of reverting to Next:

- Keep Vue 3.5.33, Vite 8.0.10, Vue Router 5.0.6, and Pinia 3.0.4.
- Port the legacy `Dev-SSO` login card, copy, password-reset link, registration link, footer links, and theme toggle into Vue.
- Keep OIDC, PKCE, session cookies, identity UI redirects, and admin API proxying server-side in the Node BFF.
- Fix unauthenticated layout so `/` uses a true full-width auth surface.

## WCAG Guardrail

The Vue frontend now has an automated WCAG-oriented theme gate:

```sh
npm run wcag:theme
```

The gate checks:

- normal text contrast at least 4.5:1;
- non-text UI boundaries and focus indicators at least 3:1;
- no negative letter spacing;
- no viewport-unit font-size scaling.

This targets the relevant WCAG 2.2 AA principles for contrast minimum, non-text contrast, text spacing resilience, and non-color-only affordances.

## Validation Evidence

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke`
- `npm run wcag:theme`
- `./scripts/validate-sso-frontend-vue-lifecycle.sh`

Local rendered artifact:

- URL: `http://127.0.0.1:4310/`
- Title text: `Masuk`
- Theme: `light`
- Login card bounds at 1440x900: `x=496`, `y=277`, `width=448`, `height=322`
- Screenshot: `/tmp/sso-vue-login-restored.png`

## Deployment Lifecycle

Deploy through the existing VPS direct deploy path:

1. Build immutable image tag on the VPS.
2. Snapshot current images as `rollback-${TAG}`.
3. Preserve two replicas for `sso-frontend` and `sso-admin-vue`.
4. Wait for all expected replicas to be healthy.
5. Run HTTPS smoke checks through local reverse proxy resolution.
6. Keep rollback tag until post-deploy verification is accepted.
