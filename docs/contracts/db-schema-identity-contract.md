# DB Schema Contract: Canonical Identity Binding

## Canonical Identity

- Canonical user binding key: `(issuer, subject_id)`
- `subject_id` is an opaque string sourced from OIDC `sub`
- `subject_id` is not a UUID contract

## Table Contract

### `users`

- Canonical column: `subject_id`
- Type: string / varchar
- Constraint: unique
- Legacy compatibility column: `subject_uuid` nullable unique

### `login_contexts`

- Canonical column: `subject_id`
- Type: string / varchar
- Constraint: indexed
- Legacy compatibility column: `subject_uuid` nullable indexed

### `refresh_token_rotations`

- Canonical column: `subject_id`
- Type: string / varchar
- Constraint: indexed
- Legacy compatibility column: `subject_uuid` nullable indexed

## API Contract

- Admin APIs must emit `subject_id`
- Resource profile payloads must emit `subject_id`
- Internal action/service payloads must use `subject_id`

## Prohibited Patterns

- Declaring `subject_id` as a UUID column
- Naming new APIs with `subject_uuid`
- Parsing `subject_id` as UUID
- Rejecting numeric-string subjects due to UUID assumptions

## Compatibility Note

`subject_uuid` remains only as a migration bridge.
It must not be treated as the canonical binding key for any new code.
