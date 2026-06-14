# Express Integration

Express runs as a **confidential client**. Tokens and the client secret stay on the server; the browser receives a session cookie.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

> [!TIP]
> Do not hardcode endpoint paths. Read discovery from `/.well-known/openid-configuration`, cache it, and use `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `end_session_endpoint` from that document.

Start with the [Integration Checklist](../integration-checklist.md). See the [API Reference](../api-reference.md) for endpoint contracts.

## 1. Install Dependencies

```bash
npm install express express-session jose
npm install --save-dev @types/express @types/express-session
```

## 2. Environment Configuration

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
SESSION_SECRET=<independent-session-signing-key>
```

Do not expose these values through a frontend bundler.

## 3. Discovery + Authorize + PKCE

```ts
import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

let discoveryCache: Record<string, string> | null = null

async function getDiscovery(): Promise<Record<string, string>> {
  if (discoveryCache) return discoveryCache
  const response = await fetch(new URL('/.well-known/openid-configuration', process.env.SSO_ISSUER))
  if (!response.ok) throw new Error('OIDC discovery failed')
  discoveryCache = await response.json()
  return discoveryCache
}

app.get('/auth/login', async (req, res) => {
  const discovery = await getDiscovery()
  const verifier = randomBytes(48).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  req.session.oidc = { verifier, state, nonce }

  const authorize = new URL(discovery.authorization_endpoint)
  authorize.search = new URLSearchParams({
    client_id: process.env.SSO_CLIENT_ID!,
    redirect_uri: process.env.SSO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid profile email offline_access roles',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  res.redirect(authorize.toString())
})
```

Use a shared session store such as Redis for multi-instance deployments. `id_token` uses `aud=client_id`; `access_token` targets the resource server.

## 4. Callback, Exchange, and `id_token` Validation

```ts
app.get('/auth/callback', async (req, res) => {
  const discovery = await getDiscovery()
  const flow = req.session.oidc
  delete req.session.oidc
  if (!flow || typeof req.query.state !== 'string' || req.query.state !== flow.state) {
    return res.status(400).send('Invalid login state')
  }

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.SSO_CLIENT_ID!,
      client_secret: process.env.SSO_CLIENT_SECRET!,
      code: String(req.query.code ?? ''),
      redirect_uri: process.env.SSO_REDIRECT_URI!,
      code_verifier: flow.verifier,
    }),
  })
  if (!response.ok) return res.status(401).send('Login failed')

  const tokens = await response.json()
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: process.env.SSO_ISSUER,
    audience: process.env.SSO_CLIENT_ID,
  })

  if (payload.nonce !== flow.nonce) {
    return res.status(401).send('Invalid login nonce')
  }

  req.session.tokens = encryptServerSide(tokens)
  return res.redirect('/dashboard')
})
```

## 5. Refresh

Send the refresh token and confidential credentials from the server. Serialize refresh per session and persist the rotated token atomically.

## 6. Role and Permission Mapping

If the application needs local RBAC, request the `roles` and/or `permissions` scopes, then read `roles[]` / `permissions[]` claims from the `id_token` or `userinfo` response.

```ts
const roles = Array.isArray(payload.roles) ? payload.roles.filter(Boolean) : []
const permissions = Array.isArray(payload.permissions) ? payload.permissions.filter(Boolean) : []
```

> [!WARNING]
> The claim name is `roles` (plural, array) — **not** `role`.

Optional scopes such as `roles`, `permissions`, and `offline_access` are emitted only when they are allow-listed for the client.

## 7. Logout

Revoke the refresh token using confidential authentication, destroy the Express session, and redirect through `/connect/logout`.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Callback loses state | Session store, proxy trust, secure cookie, and SameSite. |
| `invalid_client` | Runtime secret and confidential client type. |
| Refresh replay | Avoid parallel refresh and persist rotation atomically. |
| Login loop | Exact callback URI and cookie persistence. |
