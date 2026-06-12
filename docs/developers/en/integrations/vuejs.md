# Vue.js SPA Integration

This guide targets a browser-only SPA. Register it as a **public client** with no client secret.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider. A public SPA must never create or store a client secret.

See the [API Reference](../api-reference.md) for endpoint contracts.

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

## 3. Authorize + PKCE

```ts
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const userManager = new UserManager({
  authority: import.meta.env.VITE_SSO_ISSUER,
  client_id: import.meta.env.VITE_SSO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_SSO_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_SSO_POST_LOGOUT_URI,
  response_type: 'code',
  scope: 'openid profile email',
  code_challenge_method: 'S256',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
})
```

The library must generate state, nonce, verifier, and a SHA-256 challenge. Never fall back to `plain`.

## 4. Callback and Exchange

```ts
export async function completeLogin(): Promise<void> {
  const user = await userManager.signinRedirectCallback()
  if (user.expired) throw new Error('OIDC session expired')
}
```

The library exchanges the code with `client_id` and `code_verifier`, without a secret.

## 5. Refresh

Prefer a new authorization flow when the access token expires. If `offline_access` is approved, complete a browser threat review and use library rotation. Never persist tokens in localStorage.

## 6. Logout

Call `userManager.signoutRedirect()` and remove library state after the logout callback.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| `invalid_client` | Client is public and no secret is sent. |
| PKCE rejected | The library sends `S256`, never `plain`. |
| CORS failure | The SPA origin and token endpoint policy are approved. |
| Token exposure | Remove logging and localStorage/persisted-store usage. |
