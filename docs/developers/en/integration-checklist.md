# Integration Checklist

Use this checklist before taking an SSO client integration live. It consolidates the requirements spread across onboarding, API reference, scopes/claims, and framework guides.

## 1. Client Registration

- [ ] Choose the correct client type: **public** for SPA/mobile, **confidential** for applications with a backend/BFF.
- [ ] Register an exact-match `redirect_uri`: scheme, host, port, path, and trailing slash must match exactly.
- [ ] Use separate development and production clients.
- [ ] Store `client_secret` only for confidential clients; it is shown once and must go into a vault/server env. Never commit it. Details → [Onboarding](/en/onboarding).
- [ ] Request the minimum scopes you actually need: `openid` is required; add `profile`, `email`, `offline_access`, `roles`, and `permissions` only when needed.

## 2. Discovery and Endpoints

- [ ] Read metadata from `/.well-known/openid-configuration` at boot or deploy time.
- [ ] Cache `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`, `revocation_endpoint`, and `end_session_endpoint`.
- [ ] Do not guess or hardcode endpoint paths when discovery can provide them. Details → [API Reference](./api-reference.md).

## 3. Authorize Request

- [ ] Use Authorization Code Flow.
- [ ] Enable PKCE `S256` for **all** clients, including confidential clients.
- [ ] Generate a fresh random `state` and `nonce` for every login.
- [ ] Store the `code_verifier` safely until the callback.
- [ ] Include `openid` in the requested scopes.

## 4. Token Exchange

- [ ] Exchange the authorization code at the `token_endpoint`.
- [ ] Confidential clients send `client_secret` from the server only.
- [ ] Send the same `code_verifier` used for the authorize request.
- [ ] Use the exact same `redirect_uri` during exchange.
- [ ] Treat authorization codes as short-lived and single-use.

## 5. `id_token` Validation

- [ ] Validate the signature using JWKS and the provider signing algorithm (**ES256**).
- [ ] Validate `iss` against the discovery issuer.
- [ ] Validate `aud` = `client_id` for the `id_token`.
- [ ] Validate `exp` / `nbf` and use a small clock-skew leeway.
- [ ] Validate `nonce` against the stored authorize value.
- [ ] Do not confuse token roles: `id_token` is for local login, `access_token` is for resource server calls.

## 6. Identity and RBAC

- [ ] Use `sub` as the stable user identifier, not email.
- [ ] If RBAC is required, request the `roles` and/or `permissions` scopes.
- [ ] Read `roles[]` / `permissions[]` claims (arrays), **not** a singular `role` claim.
- [ ] Ensure optional scopes are allow-listed for the client in the admin panel. Details → [Scopes and Claims](./scopes-and-claims.md).

## 7. Session, Refresh, Logout

- [ ] Store refresh tokens encrypted server-side; avoid browser storage unless this is truly a public SPA and you have completed a threat review.
- [ ] Rotate refresh tokens atomically and prevent parallel replay.
- [ ] Use RP-initiated logout via `end_session_endpoint` / `/connect/logout` with a registered `id_token_hint` and `post_logout_redirect_uri`.
- [ ] If back-channel logout is enabled, verify that the application actually clears its local session.

## 8. Optional Header Account Bar

- [ ] For external web apps, provide a header mount point such as `<div id="sso-account"></div>`.
- [ ] Add the one-line widget:

```html
<script src="https://api-sso.timeh.my.id/widget/account.js" data-sso-widget data-client-id="your-web-app" data-mount="#sso-account"></script>
```

- [ ] Use `data-features="apps,account"` when the application needs to choose which triggers are visible.
- [ ] For manual mounting, call `window.SSOAccount.mount('#sso-account', { clientId: 'your-web-app', features: 'apps,account' })`.
- [ ] Ensure the client `app_base_url` is a web URL (`https://` or localhost development); `javascript:` and `data:` links are not rendered.
- [ ] If the application uses strict CSP, allow the SSO origin in `script-src` and `connect-src`, and allow the `/widget/account.css` stylesheet in `style-src`.
- [ ] Do not read widget cookies from JavaScript. The multi-account chooser uses an httpOnly device cookie and a server-side registry.
- [ ] Do not call native `/api/auth/*`, `/api/profile/*`, or `/api/mfa/*` endpoints from external apps. Those mutation endpoints are first-party browser APIs and require a trusted `Origin`/`Referer` plus `X-Requested-With: XMLHttpRequest`; external apps use OIDC and `/widget/*`.

## 9. Development vs Production

- [ ] `http://localhost` is for development only.
- [ ] HTTPS is required for live environments.
- [ ] Register production redirect URIs, post-logout URIs, and logout hooks separately from development.
- [ ] Logs and troubleshooting output never print tokens or secrets.

## 10. Pre-Go-Live Smoke Test

- [ ] Login succeeds and returns to the exact callback.
- [ ] State/nonce mismatches are rejected.
- [ ] A second code exchange fails as expected.
- [ ] The `id_token` is fully validated before the local session is created.
- [ ] Refresh succeeds and the old token cannot be replayed.
- [ ] Logout clears both the local session and the SSO session.
- [ ] The account bar widget, if used, shows only applications the user can access and accounts bound to this browser.
- [ ] No token or secret appears in URLs, frontend bundles, prohibited browser storage, or support tickets.

## Framework Guides

- [Laravel](./integrations/laravel.md)
- [Express](./integrations/express.md)
- [Next.js](./integrations/nextjs.md)
- [Vue.js SPA](./integrations/vuejs.md)
