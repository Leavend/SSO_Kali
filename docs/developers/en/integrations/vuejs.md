# Vue.js SPA Integration

This guide targets a browser-only SPA. Register it as a **public client** with no client secret.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider. A public SPA must never create or store a client secret.

> [!TIP]
> Do not hardcode endpoint paths. Read `/.well-known/openid-configuration`, cache the OIDC metadata in application memory, and use discovery for `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `end_session_endpoint`.

Start with the [Integration Checklist](../integration-checklist.md). See the [API Reference](../api-reference.md) for endpoint contracts.

## 1. Install Dependencies

```bash
npm install oidc-client-ts
```

## 2. Environment Configuration

```dotenv
VITE_SSO_ISSUER=https://api-sso.timeh.my.id
VITE_SSO_CLIENT_ID=<registered-public-client-id>
VITE_SSO_REDIRECT_URI=https://app.example.com/auth/callback
VITE_SSO_POST_LOGOUT_URI=https://app.example.com/
```

Every `VITE_*` value is public. Do not define `VITE_SSO_CLIENT_SECRET`.

## 3. Discovery + Authorize + PKCE

```ts
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

const discoveryResponse = await fetch(
  `${import.meta.env.VITE_SSO_ISSUER}/.well-known/openid-configuration`,
)
const discovery = await discoveryResponse.json()

export const userManager = new UserManager({
  authority: discovery.issuer,
  metadata: discovery,
  client_id: import.meta.env.VITE_SSO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_SSO_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_SSO_POST_LOGOUT_URI,
  response_type: 'code',
  scope: 'openid profile email roles',
  code_challenge_method: 'S256',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
})
```

The library must generate state, nonce, verifier, and a SHA-256 challenge. Never fall back to `plain`. In a pure SPA, `access_token` validation belongs in the resource server, not in the browser.

## 4. Callback and Exchange

```ts
export async function completeLogin(): Promise<void> {
  const user = await userManager.signinRedirectCallback()
  if (user.expired) throw new Error('OIDC session expired')
}
```

The library exchanges the code with `client_id` and `code_verifier`, without a secret.

## 5. Role and Permission Mapping

If the application needs RBAC-driven UI behavior, request the `roles` and/or `permissions` scopes, then read `roles[]` / `permissions[]` from the login result or `userinfo` response.

```ts
const roles = Array.isArray(user.profile.roles) ? user.profile.roles.filter(Boolean) : []
const permissions = Array.isArray(user.profile.permissions)
  ? user.profile.permissions.filter(Boolean)
  : []
```

> [!WARNING]
> The claim name is `roles` (plural, array) — **not** `role`.

Optional scopes such as `roles`, `permissions`, and `offline_access` are emitted only when they are allow-listed for the client.

## 6. Refresh

Prefer a new authorization flow when the access token expires. If `offline_access` is approved, complete a browser threat review and use library rotation. Never persist tokens in localStorage.

## 7. Logout

Call `userManager.signoutRedirect()` and remove library state after the logout callback.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `invalid_client` | Client is public and no secret is sent. |
| PKCE rejected | The library sends `S256`, never `plain`. |
| CORS failure | The SPA origin and token endpoint policy are approved. |
| Token exposure | Remove logging and localStorage/persisted-store usage. |
