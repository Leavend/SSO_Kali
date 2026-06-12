# API Reference

All production URLs use the issuer `https://api-sso.timeh.my.id`. Discovery is the authoritative source for endpoints and capabilities.

## Endpoint Summary

| Endpoint | Method | Authentication | Rate limit |
|---|---|---|---|
| `/.well-known/openid-configuration` | GET | none | 60/min/IP |
| `/.well-known/jwks.json`, `/jwks` | GET | none | 60/min/IP |
| `/authorize`, `/oauth2/authorize` | GET | browser session | 20/min/IP |
| `/token`, `/oauth2/token` | POST | client auth or public PKCE | 30/min/IP |
| `/userinfo` | GET/POST | Bearer access token | 60/min/IP |
| `/revocation`, `/oauth/revoke`, `/oauth2/revocation` | POST | client auth | 30/min/IP |
| `/introspect`, `/oauth2/introspect` | POST | client auth | 30/min/IP |
| `/connect/logout` | GET/POST | browser or Bearer | 30/min/IP |
| `/connect/logout/frontchannel` | GET | Bearer access token | 30/min/IP |
| `/connect/register-session` | POST | Bearer access token | 30/min/IP |

A `429` response includes `Retry-After`. Internal, admin, and portal profile endpoints are not public client APIs.

## Discovery and JWKS

```bash
curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration
curl -fsS https://api-sso.timeh.my.id/.well-known/jwks.json
```

Validate discovery `issuer`, endpoint URLs, supported client authentication methods, and `code_challenge_methods_supported`. Only `S256` is supported. Cache JWKS and re-fetch when a token has an unknown `kid`.

## Authorize

`GET /authorize` or `GET /oauth2/authorize`

| Parameter | Required | Description |
|---|---:|---|
| `client_id` | Yes | Registered client ID. |
| `redirect_uri` | Yes | Exact registered redirect URI. |
| `response_type` | Yes | Must be `code`. |
| `scope` | Yes | Space-separated and must include `openid`. |
| `state` | Yes | Client CSRF binding. |
| `nonce` | Yes | ID token replay binding. |
| `code_challenge` | Yes | Base64url SHA-256 of the verifier. |
| `code_challenge_method` | Yes | Must be `S256`. |
| `prompt`, `max_age`, `acr_values`, `login_hint` | No | Optional OIDC interaction controls. |

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

Success redirects to `redirect_uri?code=...&state=...`. Requests without PKCE S256 are rejected.

## Token

`POST /token` or `POST /oauth2/token`, using `application/x-www-form-urlencoded`.

### Authorization Code

Required values are `grant_type=authorization_code`, the one-time `code`, exact `redirect_uri`, and `code_verifier`. Public clients send `client_id` without a secret. Confidential clients authenticate with `client_secret_basic` or `client_secret_post`.

```bash
curl -fsS https://api-sso.timeh.my.id/token \
  -u "your-client-id:<secret-from-vault>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<authorization_code>" \
  -d "redirect_uri=https://app.example.com/auth/callback" \
  -d "code_verifier=<pkce-code-verifier>"
```

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

### Refresh Token

Send `grant_type=refresh_token`, the active refresh token, and confidential client authentication when applicable. Refresh tokens rotate on every successful use. Reusing an old token revokes its family.

Common errors are `invalid_client` (401), `invalid_grant` (400), `invalid_scope` (400), and `too_many_attempts` (429).

## UserInfo

```bash
curl -fsS https://api-sso.timeh.my.id/userinfo \
  -H "Authorization: Bearer <access_token>"
```

The response always contains `sub`; other claims depend on granted scopes. See [Scopes and Claims](scopes-and-claims.md).

## Revocation

`POST /revocation`, `/oauth/revoke`, or `/oauth2/revocation`

Send `token` and optional `token_type_hint`. Confidential clients authenticate. RFC 7009 responses remain `200 {}` for unknown tokens.

## Introspection

`POST /introspect` or `/oauth2/introspect`

Only confidential clients may introspect. Authenticate with Basic or POST secret and send `token` plus optional hint. Inactive responses are:

```json
{ "active": false }
```

## Logout and Session Registration

`GET /connect/logout` supports `client_id`, `id_token_hint`, registered `post_logout_redirect_uri`, and `state`.

`POST /connect/logout` uses a Bearer access token to revoke the subject/session token set and dispatch logout notifications.

`POST /connect/register-session` uses a Bearer access token to register back-channel or front-channel participation.
