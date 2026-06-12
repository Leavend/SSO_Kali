# Integrasi Express

Express berjalan sebagai **confidential client**. Semua token dan client secret berada di server; browser hanya menerima cookie session.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini, termasuk untuk confidential client.

Kontrak endpoint lengkap ada di [API Reference](../api-reference.md).

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

## 3. Authorize + PKCE

```ts
import { createHash, randomBytes } from 'node:crypto'

const random = (size: number): string => randomBytes(size).toString('base64url')

app.get('/auth/login', (req, res) => {
  const verifier = random(48)
  const state = random(32)
  const nonce = random(32)
  req.session.oidc = { verifier, state, nonce }

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
  res.redirect(authorize.toString())
})
```

Gunakan session store bersama seperti Redis pada deployment multi-instance.

## 4. Callback dan Exchange

```ts
app.get('/auth/callback', async (req, res) => {
  const flow = req.session.oidc
  delete req.session.oidc
  if (!flow || typeof req.query.state !== 'string' || req.query.state !== flow.state) {
    return res.status(400).send('Invalid login state')
  }

  const response = await fetch(`${process.env.SSO_ISSUER}/token`, {
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
  await validateIdToken(tokens.id_token, flow.nonce)
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

## 6. Logout

POST refresh token ke `/revocation` dengan autentikasi confidential, hapus session Express, lalu redirect ke `/connect/logout` menggunakan `id_token_hint` dan URI logout terdaftar.

## 7. Troubleshooting

| Gejala | Periksa |
|---|---|
| Callback kehilangan state | Session store, proxy trust, cookie secure, dan SameSite. |
| `invalid_client` | Secret runtime dan tipe confidential. |
| Refresh replay | Hindari refresh paralel dan persist rotasi atomik. |
| Login loop | Callback URI exact match dan session cookie tersedia setelah redirect. |
