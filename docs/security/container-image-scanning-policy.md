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
- CI runs Docker Scout CVE scanning for critical/high fixable CVEs.
- CI uploads SARIF output to GitHub Code Scanning when available.
- CVE scan failures do not block the first development baseline.

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

## Secrets

Docker Scout may require Docker Hub credentials for some features. Credentials
must live in GitHub Actions secrets or environment secrets, not build args, not
repository files, and not VPS shell history.

Recommended GitHub secrets:

- `DOCKERHUB_USER`
- `DOCKERHUB_TOKEN`

The project must not pass secrets through Docker build args because max
provenance can expose build argument values.
