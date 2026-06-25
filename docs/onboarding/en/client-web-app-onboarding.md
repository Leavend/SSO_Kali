# Client Web App Onboarding Guide — SSO Timeh

> **Audience:** Application owners and developers registering a web application for the first time.
> **Estimated time:** 30 minutes.
> **Official deliverable:** FR-065.

## 1. Choose the Client Type

| Type | Use when | Secret |
|---|---|---|
| **Public** | Browser-only SPA or mobile application that cannot protect credentials. | None; PKCE is mandatory. |
| **Confidential** | Application with a backend or BFF that can protect credentials. | Stored server-side only. |

Rule of thumb: server-side token calls mean confidential; browser-only logic means public.

The first-party portal and admin panel use **confidential BFF + PKCE S256**. Their browsers receive same-origin cookies and never receive OAuth tokens or secrets.

## 2. Authorization Code + PKCE

Every client must use Authorization Code with PKCE:

```text
Browser -> /authorize with state, nonce, and S256 challenge
SSO -> registered callback with code and state
Client -> validate state and POST code + verifier to /token
Client -> validate tokens and create its local session
```

Discovery: `https://api-sso.timeh.my.id/.well-known/openid-configuration`

## 3. Registration Requirements

- Redirect URIs use exact matching; wildcards are rejected.
- Production redirect URIs require HTTPS.
- `http://` is accepted only for localhost development.
- Post-logout URIs must share the redirect URI origin.
- Request `openid`; add `profile`, `email`, and approved optional scopes.
- Use separate development and production clients.

In the admin panel at `https://admin-sso.timeh.my.id`, create a client with a unique lowercase ID, owner email, type, environment, exact redirect URIs, and optional logout channels.

For confidential clients, the secret is displayed once. Store it in a vault or server environment and never commit it. Public clients do not have a secret.

## 4. Integration Selection

Use the framework guide matching the application architecture:

- [Integration Checklist](/en/integration-checklist)
- [Laravel confidential client](/en/integrations/laravel)
- [Next.js confidential BFF](/en/integrations/nextjs)
- [Vue.js public SPA](/en/integrations/vuejs)
- [Express confidential client](/en/integrations/express)

Use the [API Reference](/en/api-reference) rather than duplicating or hardcoding endpoint metadata.

## 5. One-Line Header Account Bar

For applications that want an app launcher plus account menu in their header, add a mount point:

```html
<div id="sso-account"></div>
```

Then add the hosted widget:

```html
<script src="https://sso.timeh.my.id/widget/account.js" data-sso-widget data-client-id="your-web-app" data-mount="#sso-account"></script>
```

The widget uses `/widget/session`, `/widget/apps`, `/widget/accounts`, `/widget/switch`, and `/widget/logout`. The browser never receives OAuth tokens. The multi-account chooser is limited to accounts that have signed in on this browser through an httpOnly device cookie and a server-side registry, not IP address or User-Agent.

The widget embedding origin must be explicitly approved for widget CORS: either a first-party SSO origin or a client marked as trusted for widget CORS. `app_base_url` alone is not sufficient, and credentialed widget CORS does not use redirect URIs as its allow-list. For first-party cross-origin embedding, the SSO session and device cookies must be `Secure` and `SameSite=None`.

Optional feature selection:

```html
<script src="https://sso.timeh.my.id/widget/account.js" data-sso-widget data-client-id="your-web-app" data-mount="#sso-account" data-features="apps,account"></script>
```

For applications that need manual control:

```html
<script src="https://sso.timeh.my.id/widget/account.js" data-sso-widget data-client-id="your-web-app"></script>
<script>
  window.SSOAccount.mount('#sso-account', {
    clientId: 'your-web-app',
    features: 'apps,account',
  })
</script>
```

If the application uses strict Content Security Policy, allow the SSO origin in `script-src` and `connect-src`, and allow `https://sso.timeh.my.id/widget/account.css` in `style-src`. Ensure the client `app_base_url` uses a safe web URL; non-web links such as `javascript:` and `data:` are not rendered by the widget. Do not call native `/api/auth/*`, `/api/profile/*`, or `/api/mfa/*` endpoints from external apps; use OIDC and `/widget/*`.

## 6. Integration Test Checklist

- Login redirects to SSO and returns to the exact callback.
- State and nonce are validated.
- PKCE uses `code_challenge_method=S256`.
- Authorization code exchange succeeds once.
- ID token signature, issuer, audience, expiry, and nonce are validated.
- UserInfo returns expected scoped claims.
- Refresh rotates the refresh token.
- Logout removes the local session and ends the SSO session.
- Back-channel logout removes the local session when configured.
- The account bar, if used, shows only allowed apps and accounts bound to this browser.
- No secret or token is present in a browser bundle, URL, or log.

## 7. Go Live and Rollback

1. Validate with a development client.
2. Register or activate the production client with HTTPS URIs.
3. Install production secrets in the server vault before deployment.
4. Deploy and run login, refresh, and logout smoke tests.
5. Rotate confidential secrets according to policy.

To roll back access, disable the client from its lifecycle controls. Disabling revokes active tokens. Decommission only after dependent applications have been removed.

## 8. Troubleshooting

| Error | Check |
|---|---|
| `invalid_client` | Active client, correct type, and confidential credentials. |
| `invalid_grant` | Code TTL/reuse, exact redirect URI, and original verifier. |
| Redirect mismatch | Scheme, host, port, path, case, and trailing slash. |
| PKCE required | Both challenge and verifier use S256. |
| Scope denied | Client allow-list and mandatory `openid`. |
| Session expired | Refresh rotation or a new interactive login. |

Retain `request_id` and `error_ref` when reporting a problem. Never include tokens or secrets in a support ticket.
