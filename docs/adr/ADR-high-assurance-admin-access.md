# ADR: High-Assurance Admin Access

- Status: Proposed
- Date: 2026-04-05
- Owners: IAM Architecture, Security Lead

## Context

The `dev-sso.timeh.my.id` Admin Panel is a high-risk operational surface.
It exposes session visibility and destructive session-management actions.
The current implementation already uses:

- brokered OpenID Connect login
- PKCE `S256`
- secure host-only cookies
- backend RBAC enforcement for admin-only access

What is not yet standardized is the business policy for:

- interactive credential entry requirements
- re-authentication freshness
- the distinction between authorization failure and freshness failure

## Decision

The Admin Panel uses **hosted login with forced re-authentication**.

- `dev-sso` must not collect passwords directly
- first entry to the Admin Panel must require interactive upstream authentication
- dashboard access requires **fresh authentication** no older than `15 minutes`
- destructive actions require **fresher authentication** no older than `5 minutes`

## Selected Login Model

- Login entry remains `Admin Panel -> Broker -> ZITADEL Hosted Login`
- The broker is the only OIDC integration surface for the Admin Panel
- The Admin Panel UI must only present a broker sign-in action
- Upstream interactive re-auth should be enforced with protocol controls such as `prompt=login`
- Freshness semantics should be bound with `max_age` or an equivalent broker-side auth-age contract

## Rejected Alternative

The following default model is rejected:

- custom embedded credential form inside `dev-sso`

Reasons:

- expands the credential-handling surface
- increases XSS and logging exposure
- weakens the clean IdP boundary
- makes high-assurance admin access harder to audit

## Freshness Policy

| Action | Requirement | Outcome if stale |
|---|---|---|
| Open Admin Dashboard | auth age <= 15 minutes | `reauth_required` |
| Navigate read-only admin pages | valid admin session | session remains valid |
| Revoke one session | auth age <= 5 minutes | `reauth_required` |
| Revoke all sessions for one user | auth age <= 5 minutes | `reauth_required` |
| Future critical system actions | auth age <= 5 minutes or immediate step-up | `reauth_required` |

## Error Taxonomy

### `reauth_required`

Use when:

- the user is authenticated
- the role is sufficient
- but the auth freshness window is no longer acceptable

Recommended contract:

- HTTP: `403`
- payload:

```json
{
  "error": "reauth_required",
  "error_description": "Fresh authentication is required for this action."
}
```

### `forbidden`

Use when:

- the user is authenticated
- but is not authorized for the requested admin scope

Recommended contract:

- HTTP: `403`
- payload:

```json
{
  "error": "forbidden",
  "error_description": "Admin role is required to access this resource."
}
```

## Implementation Rules

- Admin entry must require interactive upstream authentication
- Silent SSO reuse must not be sufficient for first admin entry
- Dashboard rendering must fail closed when freshness is stale
- Destructive actions must check both RBAC and freshness
- Freshness denial and role denial must produce different machine-readable errors
- Audit events must distinguish:
  - `admin_forbidden`
  - `admin_reauth_required`

## As-Built Alignment

Current runtime reality:

- Admin Panel access is effectively gated by the `admin` role
- Non-admin authenticated users are redirected to `/not_admin`
- `dev-sso` does not collect password input directly

This ADR preserves those strengths and defines the higher-assurance target for v2.0.
