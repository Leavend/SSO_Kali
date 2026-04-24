# JWT Validation Profile

## Purpose

This profile defines the as-built JWT verification policy for the Prototype SSO platform.
It implements the hardening baseline from RFC 8725 and applies it to every active trust boundary:

- ZITADEL -> `sso-backend`
- `sso-backend` -> App A
- `sso-backend` -> App B
- `sso-backend` -> back-channel logout consumers

## Mandatory Validation Rules

All active verifiers SHALL enforce the following rules:

| Control | Requirement |
| --- | --- |
| Signature | JWTs must be cryptographically verified against a trusted key set. |
| Algorithm allowlist | `alg=none` is always rejected. Non-allowlisted algorithms are always rejected. |
| Issuer | `iss` must match the configured trusted issuer for that verifier boundary. |
| Audience | `aud` must match the expected client or resource audience. |
| Expiration | `exp` must be present and must not be expired beyond configured clock skew. |
| Issued-at | `iat` must be present and must not be in the future beyond configured clock skew. |
| Token intent | Verifiers that distinguish token types must enforce `token_use`. |

## Algorithm Policy

### Upstream tokens from ZITADEL

- Default allowlist: `RS256`
- Config key: `sso.jwt.upstream_allowed_algs`

### Local broker tokens in `sso-backend`

- Default allowlist: `OIDC_SIGNING_ALG`
- Config key: `sso.jwt.local_allowed_algs`

### Downstream verification in App B

- Default allowlist: `ES256,RS256`
- Config key: `services.sso.jwt.allowed_algs`

### Downstream verification in App A

- Default allowlist: `ES256`
- Config key: `SSO_JWT_ALLOWED_ALGS`

## Clock Skew Policy

Clock skew is applied uniformly to `exp` and `iat`.

| Surface | Default |
| --- | --- |
| `sso-backend` | `JWT_CLOCK_SKEW_SECONDS=60` |
| App B | `SSO_JWT_CLOCK_SKEW_SECONDS=60` |
| App A | `SSO_JWT_CLOCK_SKEW_SECONDS=60` |

## Reject Reasons

Runtime reject counters use the following stable reason keys:

- `alg_none`
- `alg_not_allowed`
- `invalid_header`
- `signature_invalid`
- `token_expired`
- `token_not_yet_valid`
- `missing_exp`
- `missing_iat`
- `invalid_iat`
- `invalid_issuer`
- `invalid_audience`
- `invalid_token_use`
- `invalid_nonce`
- `missing_sub`
- `missing_sid`
- `missing_client_id`
- `missing_jti`
- `invalid_events`
- `token_revoked`

## Runtime Metrics

### `sso-backend`

- Counter key pattern: `metrics:jwt_reject_total:{reason}`

### App B

- Counter key pattern: `app-b:metrics:jwt_reject_total:{reason}`

## CI Expectations

CI must prove the following:

- valid tokens are accepted
- `alg=none` is rejected
- non-allowlisted algorithms are rejected
- tampered signatures are rejected
- expired tokens are rejected
- missing `iat` is rejected
- invalid `iss` or `aud` is rejected

## Implementation References

- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/app/Services/Zitadel/ZitadelTokenVerifier.php`
- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/app/Services/Oidc/AccessTokenGuard.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/BrokerTokenVerifier.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/LogoutTokenVerifier.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/jwt.ts`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/logout-token.ts`
