# JWT Verifier Test Vectors

## Objective

These vectors define the minimum CI matrix for JWT validation hardening.

## Upstream Broker Verifier (`ZitadelTokenVerifier`)

| Vector | Expected Result |
| --- | --- |
| Valid `RS256` id token with correct `iss`, `aud`, `exp`, `iat`, `nonce` | Accept |
| `alg=none` | Reject with `alg_none` |
| `alg=HS256` | Reject with `alg_not_allowed` |
| Tampered signature | Reject with `signature_invalid` |
| Expired token | Reject with `token_expired` |
| Missing `iat` | Reject with `missing_iat` |
| Wrong `iss` | Reject with `invalid_issuer` |
| Wrong `nonce` | Reject with `invalid_nonce` |

## Local Access Token Guard (`AccessTokenGuard`)

| Vector | Expected Result |
| --- | --- |
| Valid broker-issued access token | Accept |
| `alg=none` | Reject with `alg_none` |
| Missing `iat` | Reject with `missing_iat` |
| Wrong `token_use` | Reject with `invalid_token_use` |
| Revoked `jti` | Reject with `token_revoked` |

## App B Broker Token Verifier

| Vector | Expected Result |
| --- | --- |
| Valid access token | Accept |
| Valid id token | Accept |
| `alg=none` | Reject with `alg_none` |
| Missing `iat` | Reject with `missing_iat` |
| Wrong `aud` | Reject with `invalid_audience` |
| Wrong `iss` | Reject with `invalid_issuer` |
| Wrong `nonce` | Reject with `invalid_nonce` |

## App B Logout Token Verifier

| Vector | Expected Result |
| --- | --- |
| Valid logout token | Accept |
| `alg=none` | Reject with `alg_none` |
| Missing `iat` | Reject with `missing_iat` |
| Missing logout event | Reject with `invalid_events` |
| Wrong `aud` | Reject with `invalid_audience` |

## App A Verifiers

| Vector | Expected Result |
| --- | --- |
| Valid access token through `jose.jwtVerify` | Accept |
| Missing `iat` | Reject |
| Invalid `token_use` | Reject |
| Logout token without `iat` | Reject |
| Tampered token rejected by `jwtVerify` | Reject |

## Test Suites

- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/tests/Unit/Oidc/ZitadelTokenVerifierTest.php`
- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/tests/Unit/Oidc/AccessTokenGuardTest.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/tests/Unit/Sso/BrokerTokenVerifierTest.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/tests/Unit/Sso/LogoutTokenVerifierTest.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/jwt.test.ts`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/logout-token.test.ts`
