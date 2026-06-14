# Integrasi Vue.js SPA

Panduan ini untuk SPA murni yang berjalan seluruhnya di browser, sehingga client harus didaftarkan sebagai **public client** dan tidak memiliki client secret.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini. Public SPA tidak boleh membuat atau menyimpan client secret.

> [!TIP]
> Jangan hardcode path endpoint. Ambil discovery `/.well-known/openid-configuration`, cache metadata OIDC di memori aplikasi, lalu pakai `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, dan `end_session_endpoint` dari discovery.

Mulai dari [Integration Checklist](../integration-checklist.md). Lihat [API Reference](../api-reference.md) untuk kontrak endpoint.

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

## 3. Discovery + Authorize + PKCE

```ts
// src/auth/oidc.ts
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

export async function login(): Promise<void> {
  await userManager.signinRedirect()
}
```

Library harus menghasilkan state, nonce, verifier, dan challenge SHA-256. Jangan fallback ke `plain`. Untuk SPA murni, verifikasi `access_token` dilakukan di resource server, bukan di browser.

## 4. Callback dan Exchange

```ts
export async function completeLogin(): Promise<void> {
  const user = await userManager.signinRedirectCallback()
  if (user.expired) throw new Error('OIDC session expired')
}
```

Untuk public client, library menukar code dengan `client_id` dan `code_verifier` tanpa secret.

## 5. Role & Permission Mapping

Jika app perlu menampilkan variasi UI berbasis RBAC, minta scope `roles` dan/atau `permissions`, lalu baca claim `roles[]` / `permissions[]` dari hasil login atau `userinfo`.

```ts
const roles = Array.isArray(user.profile.roles) ? user.profile.roles.filter(Boolean) : []
const permissions = Array.isArray(user.profile.permissions)
  ? user.profile.permissions.filter(Boolean)
  : []
```

> [!WARNING]
> Nama claim adalah `roles` (jamak, array) — **bukan** `role`.

Scope opsional seperti `roles`, `permissions`, dan `offline_access` hanya terbit bila masuk allow-list client.

## 6. Refresh

SPA murni sebaiknya memakai authorize ulang saat access token habis. Jika client diizinkan `offline_access`, evaluasi risiko refresh token di browser dan gunakan rotasi library; jangan simpan token di `localStorage`.

```ts
export async function renew(): Promise<void> {
  await userManager.signinSilent()
}
```

## 7. Logout

```ts
export async function logout(): Promise<void> {
  await userManager.signoutRedirect()
}
```

Hapus state/token library setelah callback logout selesai.

## 8. Troubleshooting

| Gejala | Periksa |
|---|---|
| `invalid_client` | Client terdaftar sebagai public dan tidak mengirim secret. |
| PKCE ditolak | Library benar-benar mengirim `S256`, bukan `plain`. |
| CORS gagal | Origin dan kebijakan token endpoint untuk SPA sudah disetujui. |
| Token bocor | Jangan log token atau simpan di localStorage/persisted Pinia. |
