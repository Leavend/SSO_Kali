# Integration Checklist

Gunakan checklist ini sebelum go-live integrasi client SSO. Halaman ini merangkum prasyarat yang tersebar di onboarding, API reference, scope/claim, dan framework guides.

## 1. Registrasi Client

- [ ] Pilih tipe client yang benar: **public** untuk SPA/mobile, **confidential** untuk app dengan backend/BFF.
- [ ] Daftarkan `redirect_uri` exact match: skema, host, port, path, slash akhir harus identik.
- [ ] Gunakan client development dan production terpisah.
- [ ] Simpan `client_secret` hanya untuk confidential client, sekali tampil → vault/env server. Jangan commit. Detail → [Onboarding](/onboarding).
- [ ] Minta scope minimal yang benar: `openid` wajib; tambah `profile`, `email`, `offline_access`, `roles`, `permissions` hanya bila perlu.

## 2. Discovery dan Endpoint

- [ ] Ambil metadata dari `/.well-known/openid-configuration` saat boot atau deploy.
- [ ] Cache `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`, `revocation_endpoint`, `end_session_endpoint`.
- [ ] Jangan menebak atau hardcode path endpoint bila bisa memakai discovery. Detail → [API Reference](./api-reference.md).

## 3. Authorize Request

- [ ] Gunakan Authorization Code Flow.
- [ ] PKCE `S256` aktif untuk **semua** client, termasuk confidential.
- [ ] Hasilkan `state` dan `nonce` acak per login.
- [ ] Simpan `code_verifier` dengan aman sampai callback.
- [ ] `openid` ada di scope request.

## 4. Token Exchange

- [ ] Tukar authorization code di `token_endpoint`.
- [ ] Confidential client mengirim `client_secret` hanya dari server.
- [ ] Kirim `code_verifier` yang sama dengan authorize request.
- [ ] `redirect_uri` saat exchange identik dengan authorize request.
- [ ] Anggap authorization code sekali pakai dan berumur pendek.

## 5. Verifikasi `id_token`

- [ ] Verifikasi signature via JWKS dengan algoritma signing provider (**ES256**).
- [ ] Validasi `iss` terhadap issuer discovery.
- [ ] Validasi `aud` = `client_id` untuk `id_token`.
- [ ] Validasi `exp` / `nbf` dan atur leeway clock-skew kecil.
- [ ] Validasi `nonce` terhadap nilai yang disimpan saat authorize.
- [ ] Jangan tertukar: `id_token` untuk login lokal, `access_token` untuk memanggil resource server.

## 6. Identity dan RBAC

- [ ] Gunakan `sub` sebagai identitas stabil user, bukan email.
- [ ] Jika butuh RBAC, minta scope `roles` dan/atau `permissions`.
- [ ] Baca claim `roles[]` / `permissions[]` (array), **bukan** `role` singular.
- [ ] Pastikan scope opsional masuk allow-list client di admin panel. Detail → [Scopes and Claims](./scopes-and-claims.md).

## 7. Session, Refresh, Logout

- [ ] Simpan refresh token terenkripsi server-side; hindari penyimpanan browser kecuali benar-benar public SPA dengan threat review.
- [ ] Rotasi refresh token secara atomik; cegah parallel refresh replay.
- [ ] RP-initiated logout memakai `end_session_endpoint` / `/connect/logout` dengan `id_token_hint` dan `post_logout_redirect_uri` yang terdaftar.
- [ ] Jika memakai back-channel logout, pastikan endpoint app benar-benar menghapus session lokal.

## 8. Dev vs Production

- [ ] `http://localhost` hanya untuk development.
- [ ] HTTPS wajib untuk environment live.
- [ ] Redirect URI, post-logout URI, dan logout hooks production didaftarkan terpisah dari development.
- [ ] Logging/troubleshooting tidak pernah mencetak token atau secret.

## 9. Smoke Test Sebelum Go-Live

- [ ] Login berhasil → redirect ke callback exact match.
- [ ] State/nonce mismatch ditolak.
- [ ] Code exchange kedua kali gagal seperti yang diharapkan.
- [ ] `id_token` tervalidasi penuh sebelum session lokal dibuat.
- [ ] Refresh berhasil dan token lama tidak bisa direuse.
- [ ] Logout menghapus session lokal dan sesi SSO.
- [ ] Tidak ada token/secret di URL, bundle frontend, browser storage yang dilarang, atau support ticket.

## Framework Guides

- [Laravel](./integrations/laravel.md)
- [Express](./integrations/express.md)
- [Next.js](./integrations/nextjs.md)
- [Vue.js SPA](./integrations/vuejs.md)
