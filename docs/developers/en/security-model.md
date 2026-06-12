# Security Model

This document defines the public security policy that clients and resource servers must follow.

## PKCE S256 Is Mandatory

PKCE `S256` is mandatory for every client, including confidential clients. Requests without `code_challenge` and `code_challenge_method=S256` are rejected.

Plain PKCE, manual OAuth without a verifier, and libraries that cannot generate S256 are incompatible.

## Token Lifetimes

| Artifact | Lifetime | Notes |
|---|---:|---|
| Authorization code | 120 seconds | One-time use. |
| Authentication request | 900 seconds | Server-side login state. |
| Access token | 15 minutes | ES256 JWT, `aud=sso-resource-api`. |
| ID token | 15 minutes | ES256 JWT, `aud=client_id`. |
| Refresh token | 30 days | Rotated on every use. |
| Refresh token family | 90 days | Replay revokes the family. |

## Refresh Rotation

Store refresh tokens only on a server or in security-reviewed storage. Replace them atomically after refresh, serialize concurrent refresh attempts, and require a new login after `invalid_grant`.

## Rate Limits

| Area | Limit |
|---|---:|
| Authorization | 20/min/IP |
| Token, revocation, introspection | 30/min/IP |
| UserInfo | 60/min/IP |
| Discovery and JWKS | 60/min/IP |

Honor `Retry-After` and avoid parallel requests using the same refresh token.

## Signing and JWKS

Tokens use ES256 on P-256. Discover and cache JWKS, re-fetch on an unknown `kid`, reject `alg=none`, and validate issuer, audience, time claims, and token use.

## Client Checklist

- Use HTTPS for production redirect URIs.
- Generate and validate random state and nonce.
- Never log codes, tokens, refresh tokens, client secrets, or ID tokens.
- Confidential clients keep secrets and refresh tokens on the server.
- Public clients have no secret and rely on PKCE plus redirect URI policy.
- Use discovery for endpoint metadata.
- Preserve `error_ref` and `request_id` for support.
