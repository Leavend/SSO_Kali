# Security Model

Dokumen ini menjelaskan kebijakan keamanan publik yang harus dipahami client dan resource server.

## PKCE S256 Wajib

PKCE `S256` wajib untuk semua client, termasuk confidential client. OP menolak request `/authorize` yang tidak mengirim `code_challenge_method=S256` dan `code_challenge`.

Konsekuensi integrasi:

| Library/pendekatan | Status |
|---|---|
| `openid-client`, `authlib`, SDK yang mendukung PKCE | Direkomendasikan. |
| `passport-oauth2` polos tanpa PKCE | Tidak kompatibel. |
| Manual OAuth tanpa `code_verifier` | Tidak kompatibel. |

## Token Lifetimes

| Artefak | Lifetime | Catatan |
|---|---:|---|
| Authorization code | 120 detik | Sekali pakai. |
| Auth request | 900 detik | State server-side selama login/consent. |
| Access token | 15 menit | JWT ES256, `aud = sso-resource-api`. |
| ID token | 15 menit | JWT ES256, `aud = client_id`. |
| Refresh token | 30 hari | Dirotasi setiap dipakai. |
| Refresh token family | 90 hari | Reuse detection mencabut family. |

## Refresh Token Rotation

Refresh token baru diterbitkan pada setiap grant `refresh_token`. Token lama langsung tidak berlaku. Jika token lama dipakai ulang, itu dianggap replay: family refresh token dicabut dan event keamanan dicatat.

Praktik client:

1. Simpan refresh token hanya di server atau storage aman.
2. Update refresh token secara atomik setelah refresh sukses.
3. Jika dua proses refresh bersamaan, pastikan hanya satu yang menang.
4. Pada `invalid_grant`, jangan retry token lama terus-menerus; minta login ulang.

## Rate Limits

| Area | Limit |
|---|---:|
| `/authorize`, `/oauth2/authorize` | 20/min/IP |
| `/token`, `/oauth2/token`, revocation, introspection | 30/min/IP |
| `/userinfo` | 60/min/IP |
| Discovery | 60/min/IP |
| JWKS | 60/min/IP |

Pada 429, hormati `Retry-After`. Gunakan backoff dan jangan parallel-refresh banyak request dengan refresh token yang sama.

## Signing dan JWKS

Token ditandatangani ES256 (`P-256`). Discovery mengiklankan `jwks_uri` dan `id_token_signing_alg_values_supported`.

Resource server wajib:

1. Ambil JWKS dari discovery.
2. Cache JWKS sesuai header/cache policy.
3. Re-fetch JWKS bila `kid` token tidak dikenal.
4. Tolak `alg=none` dan algoritma selain yang di-discovery.
5. Validasi `iss`, `aud`, `exp`, `nbf`, `iat`, dan `token_use`.

## Client Checklist

- Gunakan HTTPS untuk semua redirect URI production.
- Pakai `state` dan `nonce` acak, simpan sementara, validasi saat callback.
- Jangan log code, token, refresh token, client secret, atau ID token.
- Confidential client menyimpan secret di server/key vault, bukan browser.
- Public client tidak punya secret; bergantung pada PKCE dan redirect URI policy.
- Gunakan discovery sebagai sumber endpoint.
- Tangani `error_ref` dan `request_id` di UI error/support.
- Untuk API call, kirim access token sebagai Bearer dan validasi di resource server.
