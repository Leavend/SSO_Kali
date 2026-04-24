# Error Taxonomy

- Status: Proposed
- Date: 2026-04-05
- Owners: IAM Architecture, Security Lead

## Scope

This taxonomy standardizes machine-readable security and access errors for Broker, Admin API, and future high-assurance login flows.

## Core Errors

| Error | HTTP | Meaning | User-facing posture |
|---|---:|---|---|
| `reauth_required` | `403` | authenticated but not fresh enough for requested scope | ask user to verify identity again |
| `forbidden` | `403` | authenticated but not authorized | show access denied |
| `invalid_credentials` | `401` | login could not be verified | generic failure |
| `handshake_failed` | route-level UI state | broker or callback handshake could not be completed safely | restart secure sign-in |
| `ambiguous_identifier` | `409` | single-field identifier matches multiple active identities | generic public failure, internal reconciliation needed |
| `too_many_attempts` | `429` or `423` by policy | throttled or temporarily locked | generic rate-limit or temporary block message |
| `mfa_required` | `403` or `401` by flow | additional factor is required | continue MFA flow |

## Response Shapes

### `reauth_required`

```json
{
  "error": "reauth_required",
  "error_description": "Fresh authentication is required for this action."
}
```

### `forbidden`

```json
{
  "error": "forbidden",
  "error_description": "You are authenticated but not authorized for this resource."
}
```

### `invalid_credentials`

```json
{
  "error": "invalid_credentials",
  "error_description": "The provided credentials could not be verified."
}
```

### `ambiguous_identifier`

```json
{
  "error": "ambiguous_identifier",
  "error_description": "The identifier matches multiple active identities."
}
```

## Security Notes

- public UX must stay generic for `invalid_credentials`
- `ambiguous_identifier` may be machine-readable internally without disclosing sensitive identity details to end users
- `reauth_required` must not be collapsed into `forbidden`
- `forbidden` must not be reused for unknown or invalid credentials

## Audit Mapping

| Error | Audit event class |
|---|---|
| `reauth_required` | `admin_reauth_required` |
| `forbidden` | `admin_forbidden` |
| `invalid_credentials` | `auth_invalid_credentials` |
| `handshake_failed` | `auth_handshake_failed` |
| `ambiguous_identifier` | `auth_ambiguous_identifier` |
| `too_many_attempts` | `auth_lockout_or_throttle` |
| `mfa_required` | `auth_mfa_required` |
