# ADR: Identity Keying & Types

- Status: Accepted
- Date: 2026-04-04
- Owners: IAM Architecture, Security Lead

## Context

The SSO platform receives upstream identities from ZITADEL through OpenID Connect.
OIDC defines the stable user key as the pair `(iss, sub)`.
ZITADEL emits opaque `sub` values that may be numeric strings and must not be treated as UUIDs.

The previous implementation used the name `subject_uuid` even after the database type was widened to string.
That naming leaked an invalid assumption into schema, services, admin APIs, and tests.

## Decision

The canonical application identity contract is now:

- Canonical key: `(issuer, subject_id)`
- `subject_id` is an opaque string
- `subject_id` must never be parsed, normalized, or validated as a UUID
- `subject_uuid` is retained only as a transitional compatibility column during migration

## Implementation Rules

- Database tables that bind upstream identity use `subject_id`
- JWT `sub` claims are mapped directly to `subject_id`
- Internal service payloads use `subject_id`
- Admin APIs return `subject_id`
- Compatibility writes mirror `subject_id` into `subject_uuid` until the legacy column is retired

## Consequences

Positive:

- Aligns storage with the OIDC identity model
- Removes UUID coupling from the authentication core
- Supports ZITADEL numeric-string subjects without adapter logic
- Makes future IdP interoperability safer

Trade-offs:

- Transitional dual-write is required for existing data
- Legacy `subject_uuid` remains in the schema for compatibility until a later cleanup migration

## Verification

The following checks enforce this ADR:

- Fresh-schema test verifies `subject_id` exists and is not a UUID column
- Migration test backfills `subject_id` from legacy `subject_uuid`
- Unit test proves opaque numeric-string `sub` values persist without UUID parsing
- Static lint blocks `subject_id` from being declared as `uuid`
