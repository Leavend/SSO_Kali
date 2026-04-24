# Identifier Resolver Spec

- Status: Draft
- Date: 2026-04-05
- Scope: future single-field login pre-auth boundary

## Contract

`IdentifierResolver` accepts exactly one user-supplied identifier string.
It does not accept, store, print, or log passwords.

## Supported Types

| Type | Rule | Normalization |
|---|---|---|
| `email` | valid email with exactly one `@` | lowercase, trim, Unicode normalize |
| `nisn` | 10 digits after removing spaces, dots, or dashes | preserve leading zeroes |
| `nip` | 18 digits after removing spaces, dots, or dashes | preserve leading zeroes |
| `username` | lowercase `a-z0-9._-`, length `3..64`, not numeric-only | lowercase, trim, Unicode normalize |

## Errors

| Error | Meaning |
|---|---|
| `invalid_credentials` | invalid syntax or zero matches |
| `ambiguous_identifier` | more than one active candidate |

## Security Rules

- numeric-only usernames are rejected
- NISN/NIP are treated as strings, never integers
- resolver returns a canonical `login_hint` only when exactly one candidate exists
- public callers must keep user-facing errors generic to avoid enumeration leakage
