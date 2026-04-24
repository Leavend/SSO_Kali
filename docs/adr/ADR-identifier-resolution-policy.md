# ADR: Identifier Resolution Policy

- Status: Proposed
- Date: 2026-04-05
- Owners: IAM Architecture, Security Lead

## Context

The canonical identity contract is already defined as `(issuer, subject_id)`.
That OIDC contract must remain stable even if business-facing login aliases change.

The business requirement is to support a future single-field login experience that may accept:

- username
- email
- NISN
- NIP

The architecture must prevent:

- alias ambiguity
- unstable identity binding
- numeric identifier collisions
- account enumeration

## Decision

Canonical identity remains:

- key: `(issuer, subject_id)`
- `subject_id` is opaque

NISN and NIP are **business aliases**, not canonical identity keys and not canonical IdP principal names.

Alias resolution happens in the **Broker boundary** before upstream authentication.
The result of resolution is a canonical login target that is forwarded to hosted login as `login_hint`.

## Canonicalization Strategy

### Canonical identity

- `subject_id` is the only stable OIDC subject binding
- email, username, NISN, and NIP must never replace `subject_id`

### Canonical login target

- the IdP should hold a stable principal login target
- business aliases resolve to that target
- password entry remains inside hosted login

## Identifier Classification Rules

| Input class | Detection rule | Normalization |
|---|---|---|
| Email | contains exactly one `@` and passes email validation | trim, Unicode normalize, lowercase |
| NISN | exactly 10 numeric digits | trim, remove separators, preserve leading zero |
| NIP | exactly 18 numeric digits | trim, remove separators, preserve leading zero |
| Username | no `@`, not fully numeric, passes username regex | trim, Unicode normalize, lowercase |

## Normalization Rules

- whitespace is trimmed
- Unicode is normalized before classification
- email is matched in lowercase
- username is matched in lowercase
- NISN and NIP are always strings, never integers
- numeric-only usernames are rejected to avoid collision with NISN/NIP

## Resolution Policy

| Match outcome | System action |
|---|---|
| Exactly 1 match | continue login with `login_hint` |
| 0 matches | `invalid_credentials` |
| More than 1 match | `ambiguous_identifier` |
| Invalid syntax | `invalid_credentials` |

## Uniqueness Policy

The following normalized aliases must be unique per issuer:

- `normalized_email`
- `normalized_username`
- `normalized_nisn`
- `normalized_nip`

If any alias resolves to more than one active identity:

- the system must fail closed
- the system must not pick a record heuristically
- the identity set must be flagged for reconciliation

## Error Taxonomy

### `invalid_credentials`

Use when:

- identifier is syntactically invalid
- no resolvable identity exists
- authentication fails

Recommended contract:

- HTTP: `401`
- payload:

```json
{
  "error": "invalid_credentials",
  "error_description": "The provided credentials could not be verified."
}
```

### `ambiguous_identifier`

Use when:

- identifier format is valid
- but more than one active identity matches

Recommended contract:

- HTTP: `409`
- payload:

```json
{
  "error": "ambiguous_identifier",
  "error_description": "The identifier matches multiple active identities."
}
```

User-facing UI should still remain generic to avoid enumeration leakage.

## Single-Field Resolution Flow

1. Broker receives one identifier value
2. Broker normalizes and classifies the input
3. Broker searches the relevant normalized alias namespace
4. Broker resolves zero, one, or multiple matches
5. Only a single unambiguous match may proceed
6. Broker forwards the canonical login target as `login_hint` to hosted login
7. Password and MFA entry remain at the IdP boundary

## Rejected Alternative

The following is rejected:

- making NISN or NIP the canonical login name inside ZITADEL

Reasons:

- business identifiers may change
- they are not suitable as long-term OIDC identity anchors
- they create lifecycle coupling between business records and principal identity

## As-Built Alignment

Current runtime reality:

- the Admin Panel does not yet expose single-field login
- identity storage already treats `subject_id` as the opaque canonical identifier

This ADR defines how business aliases may be added without breaking the canonical identity model.
