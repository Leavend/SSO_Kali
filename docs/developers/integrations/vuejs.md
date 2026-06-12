# Integrasi Vue.js SPA

Panduan ini untuk SPA murni yang berjalan seluruhnya di browser, sehingga client harus didaftarkan sebagai **public client** dan tidak memiliki client secret.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini. Public SPA tidak boleh membuat atau menyimpan client secret.

Lihat [API Reference](../api-reference.md) untuk kontrak endpoint.

## 1. Install Dependencies

```bash
npm install oidc-client-ts
```

## 2. Konfigurasi Environment

```dotenv
VITE_SSO_ISSUER=https://api-sso.timeh.my.id
VITE_SSO_CLIENT_ID=<registered-public-client-id>
VITE_SSO_REDIRECT_URI=https://app.example.com/auth/callback
VITE_SSO_POST_LOGOUT_URI=https://app.example.com/
```

Semua `VITE_*` bersifat publik. Tidak boleh ada `VITE_SSO_CLIENT_SECRET`.

## 3. Authorize + PKCE

```ts
// src/auth/oidc.ts
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

export async function login(): Promise<void> {
  await userManager.signinRedirect()
}
```

Library harus menghasilkan state, nonce, verifier, dan challenge SHA-256. Jangan fallback ke `plain`.

## 4. Callback dan Exchange

```ts
export async function completeLogin(): Promise<void> {
  const user = await userManager.signinRedirectCallback()
  if (user.expired) throw new Error('OIDC session expired')
}
```

Untuk public client, library menukar code dengan `client_id` dan `code_verifier` tanpa secret.

## 5. Refresh

SPA murni sebaiknya memakai authorize ulang saat access token habis. Jika client diizinkan `offline_access`, evaluasi risiko refresh token di browser dan gunakan rotasi library; jangan simpan token di `localStorage`.

```ts
export async function renew(): Promise<void> {
  await userManager.signinSilent()
}
```

## 6. Logout

```ts
export async function logout(): Promise<void> {
  await userManager.signoutRedirect()
}
```

Hapus state/token library setelah callback logout selesai.

## 7. Troubleshooting

| Gejala | Periksa |
|---|---|
| `invalid_client` | Client terdaftar sebagai public dan tidak mengirim secret. |
| PKCE ditolak | Library benar-benar mengirim `S256`, bukan `plain`. |
| CORS gagal | Origin dan kebijakan token endpoint untuk SPA sudah disetujui. |
| Token bocor | Jangan log token atau simpan di localStorage/persisted Pinia. |
