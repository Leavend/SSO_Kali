# Errors and FAQ

OIDC/OAuth error response memakai safe description. Jangan parse text bebas; gunakan `error` untuk logic dan tampilkan `error_ref`/`request_id` untuk support.

## Error JSON

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization grant is invalid.",
  "error_ref": "SSOERR-ABC1234",
  "request_id": "req-123",
  "retryable": false,
  "support_action": "login"
}
```

Header yang bisa muncul:

| Header | Arti |
|---|---|
| `X-Error-Ref` | Sama dengan `error_ref`. |
| `X-Request-Id` | Correlation ID request. |
| `Retry-After` | Pada 429 rate limit. |
| `WWW-Authenticate` | Pada beberapa response auth 401. |

Sertakan `error_ref` dan `request_id` saat menghubungi admin SSO. `error_ref` formatnya `SSOERR-...` dan aman dibagikan; detail teknis tetap di log server.

## Error Reference

| Error | HTTP | Arti | Solusi |
|---|---:|---|---|
| `invalid_request` | 400 | Parameter hilang/salah, redirect URI invalid, logout hint invalid. | Cek parameter wajib, exact redirect URI, `state`, `nonce`, dan PKCE. |
| `unauthorized_client` | 400 | Client tidak boleh menjalankan flow/scope tertentu. | Cek status client dan policy grant/scope di admin. |
| `access_denied` | 403 | User menolak consent atau akses ditolak. | Kembali ke aplikasi; user bisa mencoba ulang. |
| `unsupported_response_type` | 400 | `response_type` tidak didukung. | Gunakan `response_type=code`. |
| `invalid_scope` | 400 | Scope tidak dikenal/tidak diizinkan atau `openid` hilang. | Minta hanya scope allow-list client; selalu sertakan `openid`. |
| `invalid_client` | 401 | Client auth gagal. | Cek client ID, secret, Basic encoding, atau jangan kirim secret untuk public client. |
| `invalid_grant` | 400 | Code/refresh token invalid, expired, reused, redirect URI mismatch, atau PKCE mismatch. | Mulai ulang authorize flow; pastikan `code_verifier` dan `redirect_uri` sama. |
| `unsupported_grant_type` | 400 | Grant tidak didukung. | Gunakan `authorization_code` atau `refresh_token`. |
| `invalid_token` | 401 | Bearer token invalid/expired/revoked/audience salah. | Refresh token atau login ulang; resource server cek `aud`. |
| `insufficient_scope` | 403 | Token aktif tapi scope kurang. | Minta scope yang diperlukan dan pastikan client diizinkan. |
| `login_required` | 401 | `prompt=none` tetapi user belum login. | Redirect user ke login interaktif. |
| `interaction_required` | 400 | Step tambahan dibutuhkan. | Jalankan flow interaktif. |
| `consent_required` | 400 | Consent diperlukan tapi tidak bisa ditampilkan. | Jalankan ulang tanpa `prompt=none` atau minta admin cek `skip_consent`. |
| `too_many_attempts` | 429 | Rate limit terlampaui. | Hormati `Retry-After`, exponential backoff. |
| `temporarily_unavailable` | 503 | OP sementara tidak tersedia. | Retry bertahap; simpan `error_ref`. |
| `server_error` | 500 | Kendala internal OP. | Jangan tampilkan detail teknis; hubungi admin dengan `error_ref`. |

## FAQ

### Token expired, apa yang harus dilakukan?

Access token TTL 15 menit. Jika client punya `refresh_token`, gunakan grant `refresh_token`. Jika tidak punya, jalankan `/authorize` ulang.

### Kenapa `/token` mengembalikan `invalid_grant`?

Penyebab paling umum: authorization code melewati TTL 120 detik, code sudah pernah dipakai, `redirect_uri` berbeda dari request `/authorize`, `code_verifier` tidak cocok dengan `code_challenge`, atau refresh token lama direuse setelah rotasi.

### Kenapa confidential client tetap perlu PKCE?

Kebijakan OP mewajibkan PKCE S256 untuk semua client. Secret client membuktikan identitas client; PKCE membuktikan caller `/token` adalah pihak yang memulai `/authorize`. Dua kontrol ini saling melengkapi.

### State mismatch saat callback?

Jangan lanjut exchange token. Buang request, hapus state sementara, mulai login ulang. State mismatch biasanya berarti session hilang, tab lama, atau potensi CSRF.

### Clock skew menyebabkan token terlihat belum valid/expired?

Resource server boleh memberi toleransi kecil. Backend SSO memakai clock skew 60 detik untuk validasi access token lokal. Sinkronkan NTP di semua server.

### Apakah token endpoint boleh dipanggil langsung dari browser?

Untuk public SPA, token exchange berbasis PKCE bisa dilakukan tanpa secret, tetapi konfigurasi CORS dan threat model harus disiapkan hati-hati. Untuk confidential client, token exchange wajib di server. Jangan taruh `client_secret` di browser.

### CORS error saat integrasi?

Discovery/JWKS publik bisa cross-origin. Token exchange confidential harus dari backend client. Resource API sendiri yang menentukan CORS untuk aplikasi Anda.

### Cara uji cepat?

1. Ambil discovery: `curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration`.
2. Buat `state`, `nonce`, `code_verifier`, `code_challenge` S256 lalu buka `/authorize` di browser.
3. Setelah callback membawa `code`, POST ke `/token` dengan `code_verifier` dan validasi `id_token`/`access_token`.
