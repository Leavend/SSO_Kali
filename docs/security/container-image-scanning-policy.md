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

Development environment mode is advisory:

- CI generates SBOM attestations.
- CI generates max-level provenance attestations.
- CI runs a SHA-pinned Anchore Grype CVE scan for high/critical fixable
  vulnerabilities.
- CI fails when the scanner cannot run or cannot generate SARIF evidence.
- CI uploads SARIF output to GitHub Code Scanning.
- CVE findings remain advisory until the current development baseline is
  accepted and suppression/exception ownership is documented.

This avoids blocking all releases before the current image vulnerability
baseline is known.

## Promotion to Blocking Mode

Move from advisory to blocking after the team has accepted a baseline and fixed
or suppressed known issues with clear justification.

Blocking mode should fail a release when:

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
- vulnerability findings may be advisory only while the accepted baseline is
  being built
- production blocking mode must be enabled only after baseline exceptions are
  documented

The project must not pass secrets through Docker build args because max
provenance can expose build argument values.
