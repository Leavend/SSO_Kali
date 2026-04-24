# Frontend Broker Integration

## Scope

This contract applies to:
- App A (`apps/app-a-next`)
- Admin Panel (`services/sso-frontend`)

## Integration boundary

- Frontends MUST integrate only with the SSO Broker.
- Frontends MUST NOT call ZITADEL directly for authorize, token, discovery, JWKS, revoke, userinfo, or end-session flows.
- Browser-facing auth entry points must remain broker-hosted URLs such as `/authorize`, `/token`, `/jwks`, and `/connect/logout`.

## Rationale

- The broker is the only trusted integration surface for upstream identity.
- This preserves the BFF model, reduces IdP coupling, and keeps upstream endpoint drift out of application code.

## Implementation

- App A and Admin Panel run a broker-boundary scan during `npm run lint`.
- The scan rejects:
  - direct ZITADEL hosts
  - canonical upstream ZITADEL endpoint paths
  - `ZITADEL_*` env/config bindings inside frontend app roots
