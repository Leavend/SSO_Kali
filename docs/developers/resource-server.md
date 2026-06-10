# Resource Server Guide

Resource server adalah API yang menerima `Authorization: Bearer <access_token>` dari client. Jangan menerima ID token sebagai kredensial API.

## Pola Validasi Direkomendasikan: JWT Lokal + JWKS

Access token SSO adalah JWT ES256. Validasi lokal lebih cepat dan tidak bergantung ke network per request.

Validasi wajib:

| Check | Nilai |
|---|---|
| Signature | ES256 via JWKS discovery. |
| `iss` | `https://api-sso.timeh.my.id`. |
| `aud` | `sso-resource-api`. |
| `token_use` | `access`. |
| `exp`, `nbf`, `iat` | Valid dengan toleransi clock kecil. |
| `sub`, `sid`, `client_id`, `jti` | Ada dan string non-empty. |

### Node.js dengan `jose`

```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose'

const issuer = 'https://api-sso.timeh.my.id'
const audience = 'sso-resource-api'
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

export async function verifyAccessToken(token) {
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ['ES256'],
  })

  if (payload.token_use !== 'access') {
    throw new Error('Token is not an access token')
  }

  return {
    subject: payload.sub,
    clientId: payload.client_id,
    sessionId: payload.sid,
    scope: String(payload.scope ?? '').split(' ').filter(Boolean),
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    kid: protectedHeader.kid,
  }
}
```

### PHP/Laravel sketch

```php
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;

function verifySsoAccessToken(string $jwt, array $jwks): array
{
    $keys = JWK::parseKeySet($jwks);
    $decoded = JWT::decode($jwt, $keys);
    $claims = json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);

    if (($claims['iss'] ?? null) !== 'https://api-sso.timeh.my.id') {
        throw new RuntimeException('Invalid issuer');
    }

    if (($claims['aud'] ?? null) !== 'sso-resource-api') {
        throw new RuntimeException('Invalid audience');
    }

    if (($claims['token_use'] ?? null) !== 'access') {
        throw new RuntimeException('Invalid token use');
    }

    return $claims;
}
```

Tambahkan cache JWKS dan re-fetch bila `kid` tidak ditemukan. Jangan men-disable validasi signature untuk debugging.

## Pola Alternatif: Introspection

Gunakan `/introspect` bila resource server tidak bisa memvalidasi JWT lokal, perlu cek revocation sangat ketat, atau token format mungkin berubah. Endpoint ini membutuhkan confidential client auth.

```bash
curl -fsS https://api-sso.timeh.my.id/introspect \
  -u "resource-server-client:client-secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>" \
  -d "token_type_hint=access_token"
```

Response inactive selalu aman:

```json
{ "active": false }
```

Jika `active=true`, tetap cek minimal `iss`, `aud`, `client_id`, `sub`, `exp`, dan `token_use` dari response.

## Otorisasi Aplikasi

Scope menjawab "apa yang client minta". Role/permission menjawab "apa yang user boleh lakukan". Gunakan claim `roles[]` dan `permissions[]` hanya bila access token membawa scope `roles` atau `permissions`.

Praktik aman:

- Tolak token tanpa scope/permission yang diperlukan endpoint API.
- Jangan pakai `email` sebagai primary key authorization; pakai `sub`.
- Audit `sub`, `client_id`, `sid`, `jti`, dan `request_id` bila ada.
- Untuk endpoint sensitif, kombinasikan permission claim dengan policy server-side lokal.
