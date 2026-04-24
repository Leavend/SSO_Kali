# ZITADEL Login Custom Error Messages

## Purpose

This stack uses a custom message pack to make hosted-login errors:

- professional
- concise
- non-leaky
- consistent with the `dev-sso` error taxonomy

## Design

- Source of truth lives in [login-copy-catalog.mjs](/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/login-copy-catalog.mjs).
- Build-time patching is executed by [patch-login-copy.mjs](/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-copy.mjs).
- The patch runs inside the custom [Dockerfile](/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/Dockerfile) for `zitadel-login`.

## Locale Strategy

- `en`: full fallback catalog
- `de`: curated locale overrides for high-frequency auth errors
- `es`: curated locale overrides for high-frequency auth errors
- `fr`: curated locale overrides for high-frequency auth errors
- `id`: curated locale overrides prepared for future activation
- `ru`: curated locale overrides for high-frequency auth errors
- all other locales: safe English fallback for the targeted auth-error keys

This is intentional. It is preferable to show clear fallback English than to expose technical vendor messages or partial server details.

## Validation

Run:

```bash
node /Users/leavend/Desktop/Project_SSO/infra/zitadel-login/validate-login-copy-catalog.mjs
```

This checks that the locale-aware patching remains correct for:

- `en`
- `de`
- `es`
- `fr`
- `id`
- `ru`

## Targeted Message Types

- sign-in failure
- registration failure
- password reset/set/change failure
- verification required
- session expired / invalid
- identity-provider linking and selection errors
- ambiguous account matching
- account state restrictions

## Guardrails

- No server stack traces or internal diagnostics are exposed in user copy.
- Messages avoid raw backend terms such as `IDP`, `session for user`, or `userId missing`.
- The patch must fail closed if the register error copy is not found during build.

## Rollout Notes

- Rebuild only `zitadel-login` for copy changes.
- Use `--no-cache` when adjusting copy logic to avoid stale bundle layers.
- Verify both:
  - login page renders normally
  - patched keys appear in the live bundle
