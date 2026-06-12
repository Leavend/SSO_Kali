# Integrasi Next.js

Pola rekomendasi adalah **confidential BFF** memakai Route Handlers. Browser hanya memegang cookie session; code exchange, refresh token, dan secret tetap di server.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini, termasuk untuk confidential client.

Detail endpoint tetap dirujuk dari [API Reference](../api-reference.md).

## 1. Install Dependencies

```bash
npm install jose
```

## 2. Konfigurasi Environment

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
SESSION_SECRET=<independent-session-encryption-key>
```

Jangan gunakan prefix `NEXT_PUBLIC_` untuk secret atau token.

## 3. Authorize + PKCE

Route handler login membuat verifier dan state, menyimpannya dalam cookie terenkripsi/server session, lalu redirect:

```ts
// app/auth/login/route.ts
import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

const base64url = (value: Buffer): string => value.toString('base64url')

export async function GET(): Promise<NextResponse> {
  const verifier = base64url(randomBytes(48))
  const state = base64url(randomBytes(32))
  const nonce = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
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
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
```

`seal()` adalah helper session terenkripsi milik aplikasi, bukan encoding biasa.

## 4. Callback dan Exchange

```ts
// app/auth/callback/route.ts
export async function GET(request: Request): Promise<Response> {
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
  const tokenResponse = await fetch(`${process.env.SSO_ISSUER}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!tokenResponse.ok) return new Response('Login failed', { status: 401 })

  const tokens = await tokenResponse.json()
  await validateIdToken(tokens.id_token, flow.nonce)
  return createSessionRedirect(tokens)
}
```

## 5. Refresh

Lakukan refresh dari server action/route handler dan serialisasi per session:

```ts
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  client_id: process.env.SSO_CLIENT_ID!,
  client_secret: process.env.SSO_CLIENT_SECRET!,
  refresh_token: session.refreshToken,
})
```

Simpan refresh token baru secara atomik dalam server session.

## 6. Logout

Route handler logout mencabut refresh token dengan `client_secret`, menghapus cookie session, lalu redirect ke `/connect/logout` memakai `id_token_hint` dan post-logout URI terdaftar.

## 7. Catatan SPA-Only

Next.js yang benar-benar diekspor statis tanpa Route Handlers harus didaftarkan sebagai **public client**. Jangan pernah memasukkan secret ke `NEXT_PUBLIC_*`; gunakan alur browser seperti panduan [Vue.js SPA](vuejs.md).

## 8. Troubleshooting

| Gejala | Periksa |
|---|---|
| Cookie flow hilang | `Secure`, `SameSite=Lax`, domain, dan callback selesai dalam 10 menit. |
| `invalid_client` | Env server tersedia pada runtime Route Handler. |
| `invalid_grant` | Verifier dan redirect URI sama dengan request authorize. |
| Secret muncul di bundle | Hapus prefix `NEXT_PUBLIC_` dan akses env hanya dari module server. |
