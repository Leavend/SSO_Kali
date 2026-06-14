# Next.js Integration

The recommended pattern is a **confidential BFF** implemented with Route Handlers. The browser receives a session cookie only; token exchange, refresh, and secrets remain server-side.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

> [!TIP]
> Do not hardcode endpoint paths. Read and cache `/.well-known/openid-configuration`, then use its `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `end_session_endpoint` values.

Start with the [Integration Checklist](../integration-checklist.md). See the [API Reference](../api-reference.md) for endpoint details.

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

## 3. Discovery + Authorize + PKCE

```ts
import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

let discoveryCache: Record<string, string> | null = null

async function getDiscovery(): Promise<Record<string, string>> {
  if (discoveryCache) return discoveryCache
  const response = await fetch(new URL('/.well-known/openid-configuration', process.env.SSO_ISSUER), {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('OIDC discovery failed')
  discoveryCache = await response.json()
  return discoveryCache
}

export async function GET(): Promise<NextResponse> {
  const discovery = await getDiscovery()
  const verifier = randomBytes(48).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL(discovery.authorization_endpoint)
  authorize.search = new URLSearchParams({
    client_id: process.env.SSO_CLIENT_ID!,
    redirect_uri: process.env.SSO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid profile email offline_access roles',
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

`seal()` must provide authenticated encryption or use a server session. `id_token` is for local login (`aud=client_id`), while `access_token` targets the resource server.

## 4. Callback, Exchange, and `id_token` Validation

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

export async function GET(request: Request): Promise<Response> {
  const discovery = await getDiscovery()
  const url = new URL(request.url)
  const flow = await readAndDeleteFlowCookie()
  if (!flow || url.searchParams.get('state') !== flow.state) {
    return new Response('Invalid login state', { status: 400 })
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.SSO_CLIENT_ID!,
    client_secret: process.env.SSO_CLIENT_SECRET!,
    code: url.searchParams.get('code') ?? '',
    redirect_uri: process.env.SSO_REDIRECT_URI!,
    code_verifier: flow.verifier,
  })
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!tokenResponse.ok) return new Response('Login failed', { status: 401 })

  const tokens = await tokenResponse.json()
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: process.env.SSO_ISSUER,
    audience: process.env.SSO_CLIENT_ID,
  })

  if (payload.nonce !== flow.nonce) {
    return new Response('Invalid login nonce', { status: 401 })
  }

  return createSessionRedirect(tokens)
}
```

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

## 6. Role and Permission Mapping

If the application needs local RBAC, request the `roles` and/or `permissions` scopes, then read `roles[]` / `permissions[]` from the `id_token` or `userinfo` response.

```ts
const roles = Array.isArray(payload.roles) ? payload.roles.filter(Boolean) : []
const permissions = Array.isArray(payload.permissions) ? payload.permissions.filter(Boolean) : []
```

> [!WARNING]
> The claim name is `roles` (plural, array) — **not** `role`.

Optional scopes such as `roles`, `permissions`, and `offline_access` are emitted only when they are allow-listed for the client.

## 7. Logout

Revoke the refresh token on the server, delete the session cookie, and redirect through `/connect/logout`.

## 8. SPA-Only Note

A fully static Next.js export without Route Handlers must be registered as a **public client**. Never put a secret in `NEXT_PUBLIC_*`; use the browser pattern from the [Vue.js SPA guide](vuejs.md).

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Missing flow cookie | Secure/SameSite settings, domain, and callback timing. |
| `invalid_client` | Runtime server env in the Route Handler. |
| `invalid_grant` | Original verifier and exact redirect URI. |
| Secret in bundle | Remove `NEXT_PUBLIC_` and import env only in server modules. |
