# API Reference

Semua URL production memakai issuer `https://api-sso.timeh.my.id`. Discovery adalah sumber otoritatif endpoint dan kapabilitas. Client baru sebaiknya membaca `/.well-known/openid-configuration` saat boot dan cache sesuai header response.

## Ringkasan Endpoint

| Endpoint | Method | Auth | Rate limit |
|---|---|---|---|
| `/.well-known/openid-configuration` | GET | none | 60/min/IP |
| `/.well-known/jwks.json` | GET | none | 60/min/IP |
| `/jwks` | GET | none | 60/min/IP |
| `/authorize` | GET | browser session | 20/min/IP |
| `/oauth2/authorize` | GET | browser session | 20/min/IP |
| `/token` | POST | client auth or public PKCE | 30/min/IP |
| `/oauth2/token` | POST | client auth or public PKCE | 30/min/IP |
| `/userinfo` | GET/POST | Bearer access token | 60/min/IP |
| `/revocation` | POST | client auth | 30/min/IP |
| `/oauth/revoke` | POST | client auth | 30/min/IP |
| `/oauth2/revocation` | POST | client auth | 30/min/IP |
| `/introspect` | POST | client auth | 30/min/IP |
| `/oauth2/introspect` | POST | client auth | 30/min/IP |
| `/connect/logout` | GET/POST | GET browser or POST Bearer | 30/min/IP |
| `/connect/logout/frontchannel` | GET | Bearer access token | 30/min/IP |
| `/connect/register-session` | POST | Bearer access token | 30/min/IP |

Status `429` mengirim `Retry-After`. Endpoint `_internal/*`, `/admin/api/*`, dan endpoint profil portal bukan API publik integrasi client.

## Discovery

`GET /.well-known/openid-configuration`

Response berisi issuer, endpoint, JWKS, grant, scope, claim, auth method, PKCE method, dan logout capability.

```bash
curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration
```

Field penting:

| Field | Arti |
|---|---|
| `issuer` | Harus cocok saat validasi token. |
| `authorization_endpoint` | URL untuk redirect login. |
| `token_endpoint` | URL exchange code dan refresh token. |
| `userinfo_endpoint` | URL claim user berbasis access token. |
| `jwks_uri` | URL public key ES256. |
| `token_endpoint_auth_methods_supported` | `client_secret_basic`, `client_secret_post`, `none`. |
| `code_challenge_methods_supported` | Hanya `S256`. |
| `end_session_endpoint` | RP-initiated logout. |

Error: `temporarily_unavailable` 503 atau `server_error` 500 bila metadata/signing key belum siap. Error JSON memuat `error_ref` dan `request_id` bila tersedia.

## JWKS

`GET /.well-known/jwks.json` atau alias `GET /jwks`

```bash
curl -fsS https://api-sso.timeh.my.id/.well-known/jwks.json
```

Response:

```json
{
  "keys": [
    {
      "kty": "EC",
      "use": "sig",
      "alg": "ES256",
      "kid": "sso-key-1",
      "crv": "P-256",
      "x": "<base64url>",
      "y": "<base64url>"
    }
  ]
}
```

Cache JWKS. Re-fetch saat signature `kid` tidak dikenal.

## Authorize

`GET /authorize` atau `GET /oauth2/authorize`

Memulai Authorization Code flow. Endpoint ini redirect berbasis browser dan memakai session login SSO.

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `client_id` | Ya | Client ID terdaftar. |
| `redirect_uri` | Ya | Harus exact match dengan redirect URI client. |
| `response_type` | Ya | Harus `code`. |
| `scope` | Ya | Minimal `openid`; pisahkan dengan spasi. |
| `state` | Ya | CSRF binding dari client, dikembalikan di callback. |
| `nonce` | Ya | Replay binding untuk ID token. |
| `code_challenge` | Ya | Base64url SHA-256 dari `code_verifier`. |
| `code_challenge_method` | Ya | Harus `S256`. |
| `prompt` | Tidak | `login`, `consent`, `select_account`, atau `none`. |
| `max_age` | Tidak | Maksimal umur autentikasi dalam detik. |
| `acr_values` | Tidak | Contoh: `urn:sso:loa:mfa`. |
| `login_hint` | Tidak | Hint identifier user. |

Contoh:

```bash
curl -iG https://api-sso.timeh.my.id/authorize \
  --data-urlencode "client_id=your-client-id" \
  --data-urlencode "redirect_uri=https://app.example.com/auth/callback" \
  --data-urlencode "response_type=code" \
  --data-urlencode "scope=openid profile email" \
  --data-urlencode "state=opaque-state" \
  --data-urlencode "nonce=opaque-nonce" \
  --data-urlencode "code_challenge=<s256-code-challenge>" \
  --data-urlencode "code_challenge_method=S256"
```

Success: redirect ke `redirect_uri?code=...&state=...`.

Error umum:

| Error | Status/transport | Penyebab |
|---|---|---|
| `invalid_request` | JSON 400 atau redirect | Parameter wajib hilang, `redirect_uri` tidak cocok. |
| `unsupported_response_type` | JSON 400 atau redirect | `response_type` bukan `code`. |
| `invalid_scope` | JSON 400 atau redirect | Scope tidak dikenal, tidak diizinkan, atau tidak memuat `openid`. |
| `login_required` | redirect | `prompt=none` tetapi user belum punya session. |
| `consent_required` | redirect | Consent dibutuhkan dan tidak boleh interaktif. |
| `interaction_required` | redirect | Step tambahan dibutuhkan. |

PKCE S256 wajib untuk semua client. Request tanpa `code_challenge_method=S256` akan ditolak.

## Token

`POST /token` atau `POST /oauth2/token`

Content type: `application/x-www-form-urlencoded`.

### Authorization Code Grant

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `grant_type` | Ya | `authorization_code`. |
| `code` | Ya | Authorization code dari callback. Sekali pakai. TTL 120 detik. |
| `redirect_uri` | Ya | Harus sama dengan request `/authorize`. |
| `client_id` | Ya untuk public/body auth | Client ID. |
| `client_secret` | Confidential only | Secret bila memakai `client_secret_post`. Prefer Basic untuk confidential. |
| `code_verifier` | Ya | Verifier asli untuk PKCE. |

Confidential client boleh memakai HTTP Basic:

```bash
curl -fsS https://api-sso.timeh.my.id/token \
  -u "your-client-id:your-client-secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<authorization_code>" \
  -d "redirect_uri=https://app.example.com/auth/callback" \
  -d "code_verifier=<pkce-code-verifier>"
```

Public client tidak mengirim secret:

```bash
curl -fsS https://api-sso.timeh.my.id/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=your-public-client-id" \
  -d "code=<authorization_code>" \
  -d "redirect_uri=https://app.example.com/auth/callback" \
  -d "code_verifier=<pkce-code-verifier>"
```

Response:

```json
{
  "access_token": "<access_token>",
  "id_token": "<id_token>",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email",
  "refresh_token": "<refresh_token_if_offline_access>"
}
```

`refresh_token` hanya muncul bila scope `offline_access` diminta dan client diizinkan.

### Refresh Token Grant

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `grant_type` | Ya | `refresh_token`. |
| `refresh_token` | Ya | Refresh token aktif. |
| `client_id` | Ya untuk body auth | Client ID. |
| `client_secret` | Confidential only | Secret bila confidential. |

Refresh token dirotasi setiap dipakai. Reuse refresh token lama dianggap replay; family refresh token dicabut.

Error umum:

| Error | HTTP | Penyebab |
|---|---:|---|
| `unsupported_grant_type` | 400 | `grant_type` bukan `authorization_code` atau `refresh_token`. |
| `invalid_client` | 401 | Client auth gagal. |
| `invalid_grant` | 400 | Code invalid/expired/reused, PKCE mismatch, redirect URI berbeda, refresh token invalid/replayed. |
| `invalid_scope` | 400 | Scope refresh sudah tidak diizinkan untuk client. |
| `too_many_attempts` | 429 | Rate limit token. |

## UserInfo

`GET /userinfo` atau `POST /userinfo`

Auth: `Authorization: Bearer <access_token>`.

```bash
curl -fsS https://api-sso.timeh.my.id/userinfo \
  -H "Authorization: Bearer <access_token>"
```

Response mengikuti scope access token. Lihat [Scopes and Claims](scopes-and-claims.md).

```json
{
  "sub": "usr_123",
  "name": "Tio Pranoto",
  "given_name": "Tio",
  "family_name": "Pranoto",
  "email": "tio@example.com",
  "email_verified": true
}
```

Error: `invalid_token` 401 bila token hilang, expired, signature invalid, audience salah, token revoked, atau bukan access token.

## Revocation

`POST /revocation`, `/oauth/revoke`, atau `/oauth2/revocation`

Mencabut access token atau refresh token. Response selalu `200 {}` sesuai RFC 7009, termasuk saat token tidak dikenal atau client auth gagal.

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `token` | Ya | Access token atau refresh token yang akan dicabut. |
| `token_type_hint` | Tidak | `access_token` atau `refresh_token`. |

```bash
curl -fsS https://api-sso.timeh.my.id/oauth/revoke \
  -u "your-client-id:your-client-secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<token>" \
  -d "token_type_hint=refresh_token"
```

## Introspection

`POST /introspect` atau `POST /oauth2/introspect`

Auth: `client_secret_basic` atau `client_secret_post`. Public client tidak boleh introspect.

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `token` | Ya | Token yang diperiksa. |
| `token_type_hint` | Tidak | `access_token` atau `refresh_token`. Hint hanya optimasi. |

```bash
curl -fsS https://api-sso.timeh.my.id/introspect \
  -u "your-client-id:your-client-secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>" \
  -d "token_type_hint=access_token"
```

Active access token:

```json
{
  "active": true,
  "token_type": "Bearer",
  "iss": "https://api-sso.timeh.my.id",
  "aud": "sso-resource-api",
  "sub": "usr_123",
  "sid": "sid_123",
  "client_id": "your-client-id",
  "jti": "token-jti",
  "iat": 1710000000,
  "exp": 1710000900,
  "token_use": "access",
  "scope": "openid profile email"
}
```

Inactive token:

```json
{ "active": false }
```

Error: `invalid_client` 401 bila client auth gagal.

## Logout dan Session Registration

### RP-Initiated Logout

`GET /connect/logout`

| Parameter | Wajib | Deskripsi |
|---|---:|---|
| `client_id` | Disarankan | Client ID. Wajib bila tidak ada `id_token_hint`. |
| `id_token_hint` | Disarankan | ID token terakhir. Dipakai untuk client dan session binding. |
| `post_logout_redirect_uri` | Tidak | Harus terdaftar pada client. |
| `state` | Tidak | Dikembalikan ke post-logout redirect URI. |

Success tanpa redirect:

```json
{ "signed_out": true }
```

### Centralized Logout

`POST /connect/logout`

Auth: `Authorization: Bearer <access_token>`.

Mencabut refresh token subject, revocation access token per session, dispatch back-channel logout, dan mengembalikan front-channel fallback bila ada RP yang perlu iframe fallback.

Success:

```json
{
  "signed_out": true,
  "sid": "sid_123",
  "sids": ["sid_123"],
  "notifications": [],
  "frontchannel_logout_url": "https://api-sso.timeh.my.id/connect/logout/frontchannel"
}
```

### Session Registration

`POST /connect/register-session`

Auth: Bearer access token. Dipakai RP yang mendukung back-channel atau front-channel logout agar OP tahu endpoint logout client.

Success:

```json
{
  "registered": true,
  "client_id": "your-client-id",
  "sid": "sid_123"
}
```

Error: `invalid_token` 401 atau `invalid_client` 400 bila client tidak punya channel logout.
