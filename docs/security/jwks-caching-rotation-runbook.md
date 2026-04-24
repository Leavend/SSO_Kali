# JWKS Caching and Rotation Runbook

## Purpose

This runbook defines how the Prototype SSO platform handles remote JWKS caching and key rotation.

The goal is to maintain successful verification during normal key rotation without introducing unbounded retries or disabling signature checks.

## Active Runtime Surfaces

| Surface | JWKS Source | Runtime |
| --- | --- | --- |
| `sso-backend` upstream verifier | ZITADEL `/oauth/v2/keys` | PHP |
| App B broker verifier | broker `/jwks` | PHP |
| App B logout verifier | broker `/jwks` | PHP |
| App A access/id/logout verifiers | broker `/jwks` | `jose` remote JWKS |

## Policy

### 1. Cache by JWKS URL

JWKS documents are cached by URL.

### 2. Prefer cache hit when `kid` is present

If the cached key set already contains the JWT header `kid`, the cached document is used immediately.

### 3. Refresh on `kid` miss

If the cached document does not contain the requested `kid`, the verifier refreshes the JWKS document from the remote endpoint.

### 4. Bounded retries only

Refresh attempts are bounded.

- default max attempts: `2`
- no infinite retry loops

### 4a. Respect cache headers first

JWKS cache lifetime prefers upstream cache headers:

1. `Cache-Control: max-age=...`
2. `Expires`
3. configured fallback TTL

Configured min/max bounds clamp the final TTL to avoid pathological cache lifetimes.

### 5. Fail closed

If the requested `kid` still does not exist after the configured refresh attempts, verification fails.

## Runtime Metrics

### Broker

- `jwks_cache_hit_ratio`
- `jwks_refresh_success_total`
- `jwks_refresh_fail_total`

Implementation detail:
- hit ratio is derived from `jwks_cache_hit_total` and `jwks_cache_miss_total`

### App B

- `app-b:metrics:jwks_cache_hit_total`
- `app-b:metrics:jwks_cache_miss_total`
- `app-b:metrics:jwks_refresh_success_total`
- `app-b:metrics:jwks_refresh_fail_total`

## Operational Interpretation

| Signal | Interpretation | Action |
| --- | --- | --- |
| High cache hit ratio | Normal steady state | No action |
| Temporary cache misses with successful verification | Normal key rotation or cold start | Observe |
| Repeated `jwks_refresh_fail_total` growth | Remote JWKS unavailable or key not published | Inspect issuer/JWKS endpoint and active `kid` |
| `jwks_refresh_success_total` rises with temporary misses | Healthy rotation recovery | Observe; no rollback required |

## Failure Modes

### Unknown `kid`

Symptoms:
- verification fails after refresh attempts
- refresh failure metric increments

Checks:
1. confirm JWT header `kid`
2. fetch remote JWKS manually
3. verify whether the new `kid` is present

### JWKS endpoint outage

Symptoms:
- refresh failure metric increments
- verifier starts failing new key material

Checks:
1. test issuer connectivity
2. inspect TLS/proxy/runtime networking
3. confirm endpoint still returns valid JSON Web Key Set

## Manual Validation Commands

### ZITADEL upstream

```bash
curl -fsSL https://id.dev-sso.timeh.my.id/oauth/v2/keys | jq
```

### Broker downstream

```bash
curl -fsSL https://dev-sso.timeh.my.id/jwks | jq
```

## Implementation References

- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/app/Services/Zitadel/ZitadelJwksCache.php`
- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/app/Services/Oidc/JwksRotationMetrics.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/BrokerJwksCache.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/JwksRotationMetrics.php`

## External References

- ZITADEL JWKS endpoint: `/.well-known/openid-configuration` and `/oauth/v2/keys`
- JWT BCP: [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725)
