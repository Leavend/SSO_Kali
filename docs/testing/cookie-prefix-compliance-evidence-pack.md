# Cookie Prefix Compliance Evidence Pack

## Generated evidence

The CI job publishes `cookie-prefix-compliance-evidence` from:

- `test-results/cookie-prefix-compliance/**`

## Minimum contents

- broker session cookie report
- App A session cookie report
- App A expired cookie report
- Admin session cookie report
- Admin transaction cookie report
- Admin expired cookie reports

## Release usage

Promotion must be blocked if any report shows a missing cookie or a `__Host-*` rule violation.
