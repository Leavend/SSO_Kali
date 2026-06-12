# Resource Server Guide

A resource server accepts `Authorization: Bearer <access_token>`. It must never accept an ID token as an API credential.

## Recommended Validation: Local JWT + JWKS

Validate:

| Check | Required value |
|---|---|
| Signature | ES256 through discovered JWKS. |
| `iss` | `https://api-sso.timeh.my.id`. |
| `aud` | `sso-resource-api`. |
| `token_use` | `access`. |
| Time claims | Valid `exp`, `nbf`, and `iat` with small skew. |
| Identity | Non-empty `sub`, `sid`, `client_id`, and `jti`. |

```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose'

const issuer = 'https://api-sso.timeh.my.id'
const audience = 'sso-resource-api'
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ['ES256'],
  })
  if (payload.token_use !== 'access') throw new Error('Invalid token use')
  return payload
}
```

Cache JWKS and re-fetch when `kid` is unknown. Never disable signature checks during debugging.

## Alternative: Introspection

Use introspection when local JWT validation is unavailable or immediate revocation checks are required. Introspection requires confidential client authentication.

```bash
curl -fsS https://api-sso.timeh.my.id/introspect \
  -u "resource-server-client:<secret-from-vault>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>" \
  -d "token_type_hint=access_token"
```

An inactive response is always:

```json
{ "active": false }
```

## Application Authorization

Scopes describe what the client requested. Roles and permissions describe what the subject may do. Enforce required scope and permissions server-side, use `sub` rather than email as the authorization key, and audit `sub`, `client_id`, `sid`, `jti`, and request correlation IDs.
