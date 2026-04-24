# Admin API Subject ID Contract

## Canonical Path Parameters

Broker admin routes use `subjectId` as an opaque string path parameter.

- `GET /admin/api/users/{subjectId}`
- `DELETE /admin/api/users/{subjectId}/sessions`

## Contract Rules

- `subjectId` is not parsed as a UUID.
- Numeric-string subjects from ZITADEL are valid.
- Opaque non-UUID string subjects are valid.
- Server-side lookups resolve users by `users.subject_id`.

## Compatibility Note

Legacy `subjectUuid` naming is not part of the public admin route contract.

