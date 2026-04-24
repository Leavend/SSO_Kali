# ZITADEL Upstream Endpoint Contract

## Scope

This contract governs the broker's upstream calls to the self-hosted ZITADEL identity engine.

## Canonical endpoints

- Authorization: `/oauth/v2/authorize`
- Token: `/oauth/v2/token`
- JWKS: `/oauth/v2/keys`
- End session: `/oidc/v1/end_session`

## Additional broker upstream endpoints

- UserInfo: `/oidc/v1/userinfo`
- Revocation: `/oauth/v2/revoke`

## Contract rule

The broker MUST derive these endpoints from the configured issuer host and the canonical ZITADEL paths above.
It MUST NOT trust divergent discovery URLs for these core endpoints.

## Issuer mapping

- Public issuer is used for browser-facing endpoints such as authorize and end session.
- Internal issuer is used for server-to-server endpoints such as token, JWKS, userinfo, and revoke.
