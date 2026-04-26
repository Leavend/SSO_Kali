# Container Image Scanning Policy

## Scope

This policy covers custom SSO images built by GitHub Actions and deployed to
the development VPS through GHCR.

Images in scope:

- `sso-backend`
- `sso-backend-worker`
- `sso-frontend`
- `sso-admin-vue`
- `zitadel-login`
- `app-a-next`
- `app-b-laravel`

## Current Mode

Development environment mode is blocking for release images:

- CI generates SBOM attestations.
- CI generates max-level provenance attestations.
- CI runs a SHA-pinned Anchore Grype CVE scan for high/critical fixable
  vulnerabilities.
- CI fails when the scanner cannot run, cannot generate SARIF evidence, or
  finds a high/critical fixable vulnerability.
- CI uploads SARIF output to GitHub Code Scanning.

This keeps Docker image promotion deterministic without relying on Docker Hub
entitlement state or mutable scanner action tags.

## Exception Handling

Temporary exceptions must be explicit, owned, and time-boxed. A release may only
override this gate for emergency rollback when the target image is already a
previously deployed known-good tag.

The gate fails a release when:

- critical fixable CVEs are introduced
- high fixable CVEs are introduced in externally reachable services
- a base image regression is worse than the previously deployed image
- the scanner cannot run and the deploy is not an emergency rollback

## Zero-Downtime Relationship

Scanning is a pre-deploy gate. It must never run on the VPS during the traffic
switch path.

Release order:

1. Build image.
2. Attach SBOM/provenance.
3. Scan image.
4. Publish evidence.
5. Deploy immutable tag.
6. Smoke test.
7. Roll back by tag if smoke fails.

## Scanner Supply Chain

The CI workflow uses Anchore Grype through a full commit SHA pin, not a mutable
major tag. The scan runs locally in the GitHub Actions job and does not require
Docker Hub entitlement secrets.

Scanner changes must preserve these controls:

- no scanner credential is required for normal GHCR image scanning
- SARIF must be generated for every image in the build matrix
- scanner execution failure must fail CI
- high/critical fixable findings must fail CI
- any exception must be documented before the workflow is relaxed

The project must not pass secrets through Docker build args because max
provenance can expose build argument values.
