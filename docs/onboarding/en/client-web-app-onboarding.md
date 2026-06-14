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

## 5. Integration Test Checklist

- Login redirects to SSO and returns to the exact callback.
- State and nonce are validated.
- PKCE uses `code_challenge_method=S256`.
- Authorization code exchange succeeds once.
- ID token signature, issuer, audience, expiry, and nonce are validated.
- UserInfo returns expected scoped claims.
- Refresh rotates the refresh token.
- Logout removes the local session and ends the SSO session.
- Back-channel logout removes the local session when configured.
- No secret or token is present in a browser bundle, URL, or log.

## 6. Go Live and Rollback

1. Validate with a development client.
2. Register or activate the production client with HTTPS URIs.
3. Install production secrets in the server vault before deployment.
4. Deploy and run login, refresh, and logout smoke tests.
5. Rotate confidential secrets according to policy.

To roll back access, disable the client from its lifecycle controls. Disabling revokes active tokens. Decommission only after dependent applications have been removed.

## 7. Troubleshooting

| Error | Check |
|---|---|
| `invalid_client` | Active client, correct type, and confidential credentials. |
| `invalid_grant` | Code TTL/reuse, exact redirect URI, and original verifier. |
| Redirect mismatch | Scheme, host, port, path, case, and trailing slash. |
| PKCE required | Both challenge and verifier use S256. |
| Scope denied | Client allow-list and mandatory `openid`. |
| Session expired | Refresh rotation or a new interactive login. |

Retain `request_id` and `error_ref` when reporting a problem. Never include tokens or secrets in a support ticket.
