# JWKS Configuration Defaults

## Broker Defaults

| Config Key | Default | Purpose |
| --- | --- | --- |
| `sso.jwks.cache_ttl_seconds` | `300` | Fallback JWKS cache TTL when response headers do not provide `max-age` |
| `sso.jwks.min_cache_ttl_seconds` | `30` | Lower clamp for effective JWKS cache TTL |
| `sso.jwks.max_cache_ttl_seconds` | `3600` | Upper clamp for effective JWKS cache TTL |
| `sso.jwks.max_refresh_attempts` | `2` | Maximum bounded refresh attempts on `kid` miss |

Environment variables:

- `JWT_JWKS_CACHE_TTL_SECONDS`
- `JWT_JWKS_MIN_CACHE_TTL_SECONDS`
- `JWT_JWKS_MAX_CACHE_TTL_SECONDS`
- `JWT_JWKS_MAX_REFRESH_ATTEMPTS`

## App B Defaults

| Config Key | Default | Purpose |
| --- | --- | --- |
| `services.sso.jwks.cache_ttl_seconds` | `300` | Fallback JWKS cache TTL |
| `services.sso.jwks.min_cache_ttl_seconds` | `30` | Lower clamp for effective JWKS cache TTL |
| `services.sso.jwks.max_cache_ttl_seconds` | `3600` | Upper clamp for effective JWKS cache TTL |
| `services.sso.jwks.max_refresh_attempts` | `2` | Maximum bounded refresh attempts on `kid` miss |

Environment variables:

- `SSO_JWKS_CACHE_TTL_SECONDS`
- `SSO_JWKS_MIN_CACHE_TTL_SECONDS`
- `SSO_JWKS_MAX_CACHE_TTL_SECONDS`
- `SSO_JWKS_MAX_REFRESH_ATTEMPTS`

## App A Notes

App A uses `jose.createRemoteJWKSet()` and does not maintain a custom PHP-style cache service.
For Task 4, no additional custom rotation code was required in App A.

## Selection Rationale

- `300` seconds keeps the cache warm without making rotation lag excessively long.
- `2` refresh attempts gives one recovery window beyond the current stale cache state while remaining bounded and predictable.

## Change Control

If these defaults are changed:

1. update environment variables
2. rerun JWKS rotation tests
3. confirm runtime metrics remain stable after deployment
