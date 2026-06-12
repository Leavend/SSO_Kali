# Next.js Integration

The recommended pattern is a **confidential BFF** implemented with Route Handlers. The browser receives a session cookie only; token exchange, refresh, and secrets remain server-side.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

See the [API Reference](../api-reference.md) for endpoint details.

## 1. Install Dependencies

```bash
npm install jose
```

## 2. Environment Configuration

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
SESSION_SECRET=<independent-session-encryption-key>
```

Never use `NEXT_PUBLIC_` for secrets or tokens.

## 3. Authorize + PKCE

```ts
import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  const verifier = randomBytes(48).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL('/authorize', process.env.SSO_ISSUER)
  authorize.search = new URLSearchParams({
    client_id: process.env.SSO_CLIENT_ID!,
    redirect_uri: process.env.SSO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()

  const response = NextResponse.redirect(authorize)
  response.cookies.set('oidc_flow', await seal({ verifier, state, nonce }), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return response
}
```

`seal()` must provide authenticated encryption or use a server session.

## 4. Callback and Exchange

Validate state, delete temporary flow state, and POST the code, verifier, and confidential client credentials from the Route Handler. Validate ID token signature, issuer, audience, expiry, and nonce before creating the application session.

## 5. Refresh

```ts
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  client_id: process.env.SSO_CLIENT_ID!,
  client_secret: process.env.SSO_CLIENT_SECRET!,
  refresh_token: session.refreshToken,
})
```

Serialize refresh per session and store the rotated token atomically.

## 6. Logout

Revoke the refresh token on the server, delete the session cookie, and redirect through `/connect/logout`.

## 7. SPA-Only Note

A fully static Next.js export without Route Handlers must be registered as a **public client**. Never put a secret in `NEXT_PUBLIC_*`; use the browser pattern from the [Vue.js SPA guide](vuejs.md).

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Missing flow cookie | Secure/SameSite settings, domain, and callback timing. |
| `invalid_client` | Runtime server env in the Route Handler. |
| `invalid_grant` | Original verifier and exact redirect URI. |
| Secret in bundle | Remove `NEXT_PUBLIC_` and import env only in server modules. |
