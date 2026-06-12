# Scopes and Claims

Scopes are space-separated on `/authorize`. `openid` is mandatory, and a client may request only its allow-listed scopes.

## Scope Catalog

| Scope | Default | Claims/effect | Notes |
|---|---:|---|---|
| `openid` | Yes | `sub` and OIDC protocol claims | Required. |
| `profile` | Yes | `name`, `given_name`, `family_name` | Returned when values exist. |
| `email` | Yes | `email`, `email_verified` | Verification is boolean. |
| `offline_access` | No | Refresh token | Issued only when allowed. |
| `roles` | No | `roles[]` | RBAC role slugs. |
| `permissions` | No | `permissions[]` | Resolved permission slugs. |

## UserInfo

`/userinfo` always returns `sub`. Other fields depend on the access token scopes.

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

Validate ES256 signature through JWKS, `iss`, `aud = client_id`, `exp`, `nbf`, `iat`, and `nonce`.

Important claims are `iss`, `aud`, `azp`, `sub`, `token_use=id`, `jti`, `sid`, `nonce`, `at_hash`, `auth_time`, `amr`, `acr`, `iat`, `nbf`, and `exp`. The current ID token TTL is 15 minutes.

## Access Token Claims

Access tokens are for resource APIs, not UI login. Validate ES256 signature, `iss`, `aud = sso-resource-api`, `token_use=access`, `exp`, `nbf`, `iat`, `jti`, `sub`, `sid`, and `client_id`.

The current access token TTL is 15 minutes. `scope` is a space-separated string. Role and permission arrays appear only when their scopes were granted.

## Consent

Consent appears when client policy requires user approval. `prompt=consent` forces an interactive consent screen. `prompt=none` cannot display UI and returns `login_required`, `consent_required`, or `interaction_required` when interaction is needed.
