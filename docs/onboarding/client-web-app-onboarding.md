# Panduan Onboarding Client Web App — SSO Timeh

> **Target:** App-owner / developer yang baru pertama kali mendaftarkan web app ke SSO.  
> **Estimasi:** 30 menit dari daftar sampai integrasi selesai.  
> **Deliverable resmi:** FR-065

---

## 1. Konsep Singkat

### Apa itu SSO Client?

SSO (Single Sign-On) Timeh adalah identity provider terpusat. Setiap web app yang ingin memakai login SSO harus terdaftar sebagai **client** terlebih dahulu. Setelah terdaftar, user bisa login ke app kamu pakai akun SSO Timeh tanpa harus membuat akun baru.

### Public vs Confidential — Kapan Pakai yang Mana?

| Tipe Client | Kapan Dipakai | Contoh | Punya Secret? |
|---|---|---|---|
| **Public** | App yang berjalan di browser user (SPA, mobile app). Tidak bisa merahasiakan credential. | Next.js SPA, React Native, Flutter Web | Tidak — wajib **PKCE** |
| **Confidential** | App yang punya backend server. Bisa menyimpan secret secara aman. | Laravel, Express.js, Go backend | Ya — secret disimpan di server-side |

> **Rule of thumb:** Jika app kamu punya `fetch` atau `axios` dari server (bukan dari browser), pakai `confidential`. Jika semua logika ada di client-side browser, pakai `public`.

Implementasi first-party portal dan admin pada repo ini mengikuti pola
**BFF = confidential + PKCE S256**. Authorization code, refresh token, dan
revocation diproses di server BFF dengan `client_secret`; browser hanya menerima
cookie sesi same-origin dan tidak pernah menerima token atau secret.

### Authorization Code + PKCE (Wajib)

Semua client **wajib** menggunakan Authorization Code Flow dengan **PKCE** (Proof Key for Code Exchange), sesuai security best practice OAuth 2.1:

```
User klik "Login dengan SSO"
  → Redirect ke https://api-sso.timeh.my.id/authorize
    → User login / consent
      → Redirect balik ke callback app kamu dengan ?code=...
        → App kamu tukar code dengan token di /token (server-side)
          → App kamu terima access_token + id_token + refresh_token
```

### Discovery URL

Semua endpoint OIDC bisa ditemukan di:

```
https://api-sso.timeh.my.id/.well-known/openid-configuration
```

Dari sini kamu bisa melihat `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `revocation_endpoint`, dan `end_session_endpoint` yang akurat.

---

## 2. Prasyarat

### Redirect URI — Exact Match

Format: `{origin}{callback_path}`

- **Contoh development:** `http://localhost:3000/api/auth/callback`
- **Contoh live:** `https://app-kamu.com/api/auth/callback`
- **HTTPS wajib untuk live.** Origin dengan `http://` hanya diterima untuk `localhost` di environment development.
- Path harus exact; wildcard (`*`) tidak diterima.
- Redirect URI tidak boleh dipakai oleh client lain (conflict detection server-side).

### Post-Logout Redirect URI (Opsional)

- URL yang dituju user setelah logout dari SSO.
- Harus satu origin dengan redirect URI.
- Jika tidak diisi, user akan tetap di halaman SSO setelah logout.

### Back-Channel / Front-Channel Logout (Opsional)

- **Back-channel logout URI**: SSO akan mengirim POST request ke URL ini saat sesi user diakhiri. App kamu harus memprosesnya untuk menghapus session lokal.
- **Front-channel logout**: User akan di-redirect secara berurutan ke semua client yang punya `frontchannel_logout_uri`.

### Scope yang Dibutuhkan

| Scope | Keterangan | Wajib? |
|---|---|---|
| `openid` | Tanda bahwa ini OIDC flow | Ya |
| `profile` | Nama, picture, dll | Disarankan |
| `email` | Email user | Disarankan |
| `offline_access` | Dapatkan refresh token untuk akses jangka panjang | Disarankan |
| `roles` | Role/permission user dari backend | Opsional |
| `permissions` | Permission detail dari backend | Opsional |

---

## 3. Langkah Pendaftaran (via Admin Panel)

### Admin buka panel admin:

```
https://admin-sso.timeh.my.id
```

### Buat client:

1. Klik menu **Clients** di sidebar
2. Klik tombol **Buat Client**
3. Isi form:

| Field | Keterangan |
|---|---|
| **Client ID** | Slug unik (3-63 karakter, lowercase, tanpa spasi). Contoh: `app-kamu-web` |
| **Display Name** | Nama yang mudah dibaca. Contoh: `App Kamu Web` |
| **Owner Email** | Email penanggung jawab app |
| **Client Type** | `Public` (SPA/Mobile) atau `Confidential` (Web App dengan Server) |
| **Redirect URI** | URL callback lengkap. Contoh: `https://app-kamu.com/api/auth/callback` |
| **Logout URL** | (Opsional) URL post-logout redirect |
| **Environment** | `development` atau `live` |

4. Klik **Buat Client**
5. **Untuk confidential client**: Secret akan ditampilkan **SEKALI**. Salin dan simpan di key vault / environment variable server kamu. **Jangan commit ke Git.**
6. **Untuk public client**: Tidak ada secret. Pastikan implementasi PKCE benar.
7. Klik **Salin Semua Konfigurasi** untuk mendapatkan blok `.env` siap tempel.

---

## 4. Integrasi

Pilih panduan sesuai arsitektur aplikasi. Halaman ini tidak mengulang glue code
framework agar kontrak keamanan tetap konsisten:

- [Integration Checklist](/integration-checklist)
- [Laravel confidential client](/integrations/laravel)
- [Next.js route-handler BFF](/integrations/nextjs)
- [Vue.js public SPA](/integrations/vuejs)
- [Express confidential client](/integrations/express)

### Endpoint (dari Discovery)

| Endpoint | URL | Metode |
|---|---|---|
| Authorization | `https://api-sso.timeh.my.id/authorize` | GET (redirect) |
| Token | `https://api-sso.timeh.my.id/token` | POST |
| UserInfo | `https://api-sso.timeh.my.id/userinfo` | GET |
| JWKS | `https://api-sso.timeh.my.id/jwks` | GET |
| Revocation | `https://api-sso.timeh.my.id/revocation` | POST |
| Logout | `https://api-sso.timeh.my.id/connect/logout` | GET (redirect) |

### Contoh: Public Client (Next.js / SPA — PKCE tanpa Secret)

```typescript
// 1. Generate PKCE code_verifier & code_challenge
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64url(array)
}

function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  return crypto.subtle.digest('SHA-256', data).then((hash) => base64url(new Uint8Array(hash)))
}

// 2. Redirect user ke authorize
const state = crypto.randomUUID()
const codeVerifier = generateCodeVerifier()
sessionStorage.setItem('pkce_verifier', codeVerifier)
sessionStorage.setItem('auth_state', state)

const params = new URLSearchParams({
  client_id: 'app-kamu-web',
  redirect_uri: 'https://app-kamu.com/api/auth/callback',
  response_type: 'code',
  scope: 'openid profile email offline_access',
  state,
  code_challenge: await generateCodeChallenge(codeVerifier),
  code_challenge_method: 'S256',
})

window.location.href = `https://api-sso.timeh.my.id/authorize?${params}`

// 3. Di callback handler
const code = new URL(window.location.href).searchParams.get('code')
const returnedState = new URL(window.location.href).searchParams.get('state')

if (returnedState !== sessionStorage.getItem('auth_state')) {
  throw new Error('State mismatch — possible CSRF')
}

// 4. Tukar code dengan token (ini BISA dari client-side untuk public client)
const tokenResponse = await fetch('https://api-sso.timeh.my.id/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'app-kamu-web',
    code,
    redirect_uri: 'https://app-kamu.com/api/auth/callback',
    code_verifier: sessionStorage.getItem('pkce_verifier')!,
  }),
})

const tokens = await tokenResponse.json()
// tokens.access_token, tokens.id_token, tokens.refresh_token

sessionStorage.removeItem('pkce_verifier')
sessionStorage.removeItem('auth_state')
```

### Contoh: Confidential Client (Laravel / Node — dengan Secret)

```php
// Laravel: config/services.php
'sso' => [
    'client_id' => env('SSO_CLIENT_ID'),
    'client_secret' => env('SSO_CLIENT_SECRET'),
    'redirect' => env('SSO_REDIRECT_URI'),
    'issuer' => 'https://api-sso.timeh.my.id',
],

// Laravel: redirect ke authorize
public function redirect(): RedirectResponse
{
    $codeVerifier = bin2hex(random_bytes(32));
    session()->put('pkce_verifier', $codeVerifier);

    $query = http_build_query([
        'client_id' => config('services.sso.client_id'),
        'redirect_uri' => config('services.sso.redirect'),
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => session()->get('auth_state'),
        'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '='),
        'code_challenge_method' => 'S256',
    ]);

    return redirect('https://api-sso.timeh.my.id/authorize?' . $query);
}

// Laravel: callback handler
public function callback(Request $request): RedirectResponse
{
    // 1. Verifikasi state
    if ($request->state !== session()->pull('auth_state')) {
        abort(403, 'State mismatch');
    }

    // 2. Tukar code dengan token (server-side — pakai secret)
    $response = Http::asForm()->post('https://api-sso.timeh.my.id/token', [
        'grant_type' => 'authorization_code',
        'client_id' => config('services.sso.client_id'),
        'client_secret' => config('services.sso.client_secret'),
        'code' => $request->code,
        'redirect_uri' => config('services.sso.redirect'),
        'code_verifier' => session()->pull('pkce_verifier'),
    ]);

    $tokens = $response->json();
    // $tokens['access_token'], $tokens['id_token'], $tokens['refresh_token']

    // 3. Ambil user info
    $userResponse = Http::withToken($tokens['access_token'])
        ->get('https://api-sso.timeh.my.id/userinfo');

    $user = $userResponse->json();
    // Login atau create user di database lokal
}
```

### Refresh Token (Server-Side)

```php
$response = Http::asForm()->post('https://api-sso.timeh.my.id/token', [
    'grant_type' => 'refresh_token',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'refresh_token' => $storedRefreshToken,
]);
```

### Logout (RP-Initiated)

```
https://api-sso.timeh.my.id/connect/logout
  ?id_token_hint={id_token}
  &post_logout_redirect_uri=https://app-kamu.com
  &state={state}
```

> Back-channel logout: SSO akan POST ke backchannel_logout_uri kamu dengan parameter `logout_token` (JWT). Verifikasi signature pakai JWKS dan hapus session lokal user.

---

## 5. Uji

### Checklist Integration Test

- [ ] **Login flow**: User klik "Login" → redirect ke SSO → login → callback balik ke app → user terautentikasi
- [ ] **Callback validation**: Verifikasi `state` parameter untuk cegah CSRF
- [ ] **PKCE**: Verifikasi `code_verifier` sesuai dengan `code_challenge` yang dikirim
- [ ] **Token exchange**: `POST /token` berhasil, menerima `access_token` + `id_token` (+ `refresh_token` jika `offline_access`)
- [ ] **Validate id_token**: Verifikasi `iss` = `https://api-sso.timeh.my.id`, `aud` = client_id kamu, `exp` belum lewat, `nonce` jika dipakai
- [ ] **UserInfo**: `GET /userinfo` mengembalikan data user
- [ ] **Refresh token**: `POST /token` dengan `grant_type=refresh_token` berhasil
- [ ] **Logout**: Redirect ke `/connect/logout` → session SSO terputus
- [ ] **Back-channel logout** (jika dikonfigurasi): App menerima `logout_token` dan menghapus session lokal
- [ ] **Session expiry**: Access token expired → refresh berhasil → user tetap login
- [ ] **Silent SSO**: User yang sudah login ke SSO tidak diminta login ulang saat buka app

---

## 6. Go-Live & Rollback

### Development → Live

1. Buat client **development** terpisah untuk testing
2. Setelah semua test hijau, buat client **live** baru (atau ubah environment ke `live`)
3. **HTTPS wajib untuk live.** Redirect URI harus pakai `https://`
4. Update environment variable di server production
5. Deploy app kamu
6. **Rotasi secret** setelah go-live (untuk confidential client)

### Rotasi Secret

Jika secret bocor atau sebagai rotasi rutin:
1. Admin buka panel Clients
2. Pilih client → tab Security
3. Klik **Rotate Secret**
4. Secret baru akan tampil **SEKALI** — salin dan update vault/environment variable
5. Secret lama otomatis tidak berlaku

### Rollback

Untuk menonaktifkan akses SSO sementara:
1. Admin buka panel Clients
2. Pilih client → tab Lifecycle
3. Klik **Disable Client** — semua token aktif akan dicabut

### Decommission

Untuk menghapus client permanen:
1. Admin buka panel Clients
2. Pilih client → tab Lifecycle
3. Ketik client ID untuk konfirmasi → klik **Decommission**

---

## 7. Troubleshooting

### Error Umum

| Error | Penyebab | Solusi |
|---|---|---|
| `invalid_client` | Client ID tidak terdaftar atau client di-nonaktifkan | Pastikan client sudah dibuat dan status `active` |
| `invalid_grant` | Authorization code sudah dipakai atau expired | Jangan reuse code; minta code baru dari `/authorize` |
| `redirect_uri_mismatch` | Redirect URI tidak sama persis dengan yang didaftarkan | Cek karakter case, trailing slash, protocol (`http` vs `https`) |
| `PKCE required` | Public client tidak mengirim `code_challenge` atau `code_verifier` | Pastikan S256 PKCE diimplementasikan |
| `invalid_client_secret` | Confidential client mengirim secret yang salah | Cek env variable; jika tidak yakin, rotasi secret |
| `scope denied` | Scope yang diminta tidak diizinkan untuk client | Cek daftar scope di panel admin → tab Scopes & Access |
| `session expired` | Refresh token gagal; user perlu login ulang | Normal jika idle timeout atau absolute timeout tercapai |
| `unauthorized_client` | Client mencoba grant type yang tidak diizinkan | Pastikan pakai Authorization Code + PKCE |

### Error Taxonomy (FR-060)

Semua error dari SSO mengikuti taksonomi error standar. Response body akan berisi:
```json
{
  "error": "error_code",
  "error_description": "deskripsi singkat",
  "request_id": "req-xxx"
}
```

Gunakan `request_id` saat melaporkan masalah ke tim SSO.

---

## Referensi

- [Discovery Endpoint](https://api-sso.timeh.my.id/.well-known/openid-configuration)
- [Admin Panel](https://admin-sso.timeh.my.id)
- [RFC 6749 — OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Client Integration Runbook](https://github.com/Leavend/SSO_Kali/blob/main/docs/generated/client-integration-rfc7642-runbook-2026-04-28.md) (teknis/devops)

---

_Dokumen dibuat 2026-06-05. FR-065 — Panduan Onboarding Client Web App SSO Timeh._
