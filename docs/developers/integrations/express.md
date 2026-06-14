# Integrasi Express

Express berjalan sebagai **confidential client**. Semua token dan client secret berada di server; browser hanya menerima cookie session.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini, termasuk untuk confidential client.

> [!TIP]
> Jangan hardcode path endpoint. Ambil endpoint dari discovery `/.well-known/openid-configuration`, cache, lalu gunakan `authorization_endpoint`, `token_endpoint`, `jwks_uri`, dan `end_session_endpoint` dari dokumen itu.

Mulai dari [Integration Checklist](../integration-checklist.md). Kontrak endpoint lengkap ada di [API Reference](../api-reference.md).

## 1. Install Dependencies

```bash
npm install express express-session jose
npm install --save-dev @types/express @types/express-session
```

## 2. Konfigurasi Environment

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
SESSION_SECRET=<independent-session-signing-key>
```

Jangan expose variable ini melalui bundler frontend.

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

const random = (size: number): string => randomBytes(size).toString('base64url')

app.get('/auth/login', async (req, res) => {
  const discovery = await getDiscovery()
  const verifier = random(48)
  const state = random(32)
  const nonce = random(32)
  req.session.oidc = { verifier, state, nonce }

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
  res.redirect(authorize.toString())
})
```

Gunakan session store bersama seperti Redis pada deployment multi-instance. `id_token` harus punya `aud=client_id`; `access_token` untuk resource server punya audience berbeda.

## 4. Callback, Exchange, dan Verifikasi `id_token`

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

```ts
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  client_id: process.env.SSO_CLIENT_ID!,
  client_secret: process.env.SSO_CLIENT_SECRET!,
  refresh_token: tokens.refreshToken,
})
```

Kunci refresh per session dan simpan hasil rotasi sebelum request lain dilanjutkan.

## 6. Role & Permission Mapping

Jika app perlu RBAC lokal, minta scope `roles` dan/atau `permissions`, lalu baca claim `roles[]` / `permissions[]` dari `id_token` atau `userinfo`.

```ts
const roles = Array.isArray(payload.roles) ? payload.roles.filter(Boolean) : []
const permissions = Array.isArray(payload.permissions) ? payload.permissions.filter(Boolean) : []
```

> [!WARNING]
> Nama claim adalah `roles` (jamak, array) — **bukan** `role`.

Scope opsional seperti `roles`, `permissions`, dan `offline_access` hanya terbit bila masuk allow-list client.

## 7. Logout

POST refresh token ke `/revocation` dengan autentikasi confidential, hapus session Express, lalu redirect ke `/connect/logout` menggunakan `id_token_hint` dan URI logout terdaftar.

## 8. Troubleshooting

| Gejala | Periksa |
|---|---|
| Callback kehilangan state | Session store, proxy trust, cookie secure, dan SameSite. |
| `invalid_client` | Secret runtime dan tipe confidential. |
| Refresh replay | Hindari refresh paralel dan persist rotasi atomik. |
| Login loop | Callback URI exact match dan session cookie tersedia setelah redirect. |
