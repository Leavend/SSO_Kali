# Scopes and Claims

Scope dikirim sebagai string dipisah spasi pada `/authorize`. `openid` wajib. Client hanya boleh meminta scope yang ada di allow-list client tersebut.

## Scope Catalog

| Scope | Default allowed | Claim/efek | Catatan |
|---|---:|---|---|
| `openid` | Ya | `sub`, claim protokol OIDC | Wajib untuk semua request. |
| `profile` | Ya | `name`, `given_name`, `family_name` | Muncul di ID token, access token, dan `/userinfo` bila scope diberikan. |
| `email` | Ya | `email`, `email_verified` | `email_verified` boolean. |
| `offline_access` | Tidak | `refresh_token` pada token response | Hanya terbit bila client diizinkan scope ini. |
| `roles` | Tidak | `roles[]` | Role slug RBAC user. |
| `permissions` | Tidak | `permissions[]` | Permission slug hasil resolver RBAC. |
| `staff_identity` | Tidak | `nik`, `nip`, `nisn`, `birth_date` | Identitas staf dalam bentuk masked/display-safe; tidak mengembalikan nomor mentah. |

## `/userinfo` Schema

`/userinfo` selalu mengembalikan `sub`. Field lain bergantung pada scope access token.

| Field | Type | Kondisi |
|---|---|---|
| `sub` | string | Selalu ada. |
| `name` | string | Scope `profile` dan value tersedia. |
| `given_name` | string | Scope `profile` dan value tersedia. |
| `family_name` | string | Scope `profile` dan value tersedia. |
| `email` | string | Scope `email` dan value tersedia. |
| `email_verified` | boolean | Scope `email` dan value tersedia. |
| `roles` | string[] | Scope `roles`. |
| `permissions` | string[] | Scope `permissions`. |
| `nik` | string | Scope `staff_identity` dan value tersedia; masked/display-safe. |
| `nip` | string | Scope `staff_identity` dan value tersedia; masked/display-safe. |
| `nisn` | string | Scope `staff_identity` dan value tersedia; masked/display-safe. |
| `birth_date` | string | Scope `staff_identity` dan value tersedia; masked/display-safe. |

Minimal:

```json
{ "sub": "usr_123" }
```

Dengan `openid profile email roles permissions`:

```json
{
  "sub": "usr_123",
  "name": "Tio Pranoto",
  "given_name": "Tio",
  "family_name": "Pranoto",
  "email": "tio@example.com",
  "email_verified": true,
  "roles": ["admin"],
  "permissions": ["clients.read", "clients.write"]
}
```

## ID Token Claims

ID token ditujukan untuk client/RP. Validasi minimal: signature ES256 via JWKS, `iss`, `aud = client_id`, `exp`, `nbf`, `iat`, dan `nonce`.

| Claim | Type | Arti |
|---|---|---|
| `iss` | string | Issuer. Production: `https://api-sso.timeh.my.id`. |
| `aud` | string | Client ID penerima ID token. |
| `azp` | string | Authorized party, sama dengan client ID. |
| `sub` | string | Subject ID user. |
| `token_use` | string | `id`. |
| `jti` | string | Token ID unik. |
| `sid` | string | SSO session ID untuk logout. |
| `nonce` | string | Nilai dari `/authorize`, bila dikirim. |
| `at_hash` | string | Hash access token untuk hybrid validation. |
| `auth_time` | int | Waktu autentikasi user. |
| `amr` | string[] | Authentication methods, contoh `pwd`, `mfa`. |
| `acr` | string | Assurance context bila ada. |
| `iat`, `nbf`, `exp` | int | Waktu token. TTL ID token 15 menit. |

Scope `profile`, `email`, `roles`, `permissions`, dan `staff_identity` menambahkan claim sesuai tabel scope.

## Access Token Claims

Access token ditujukan untuk resource server/API, bukan untuk UI login. Validasi wajib: signature ES256 via JWKS, `iss`, `aud = sso-resource-api`, `exp`, `nbf`, `iat`, `token_use = access`, `jti`, `sub`, `sid`, dan `client_id`.

| Claim | Type | Arti |
|---|---|---|
| `iss` | string | Issuer. |
| `aud` | string | Selalu `sso-resource-api` untuk resource server saat ini. |
| `sub` | string | Subject ID user. |
| `client_id` | string | Client yang menerima token. |
| `token_use` | string | `access`. |
| `scope` | string | Scope granted dipisah spasi. |
| `jti` | string | Token ID untuk revocation. |
| `sid` | string | SSO session ID. |
| `auth_time`, `amr`, `acr` | mixed | Assurance context. |
| `iat`, `nbf`, `exp` | int | Waktu token. TTL access token 15 menit. |

## Consent

Consent muncul saat client membutuhkan persetujuan user dan policy client tidak `skip_consent`. Admin dapat mengatur policy client dari control plane.

`prompt=consent` memaksa layar consent bila flow interaktif. `prompt=none` tidak boleh memunculkan UI; bila login/consent/interaksi dibutuhkan, OP mengembalikan error OIDC seperti `login_required`, `consent_required`, atau `interaction_required`.
