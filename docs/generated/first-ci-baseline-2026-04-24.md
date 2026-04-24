# First CI Baseline - SSO Development

Date: 2026-04-24
Scope: local CI-equivalent baseline for Laravel, Vue, Next.js, DevOps lifecycle, security gates, and zero-downtime release readiness.

## Executive Summary

The first CI baseline is functionally green in a clean local workspace. Remote GitHub Actions was not triggered from this machine because `/Users/leavend/Desktop/Project_SSO` is not a Git checkout and GitHub CLI is not authenticated.

To keep the lifecycle safe, this run did not mutate the live VPS service. All execution stayed in local/temporary CI workspaces and focused on repeatable build, test, security, and release-readiness gates.

## Remote CI Trigger Status

- `git rev-parse --is-inside-work-tree`: blocked, current project folder is not a Git repository.
- `gh auth status`: blocked, no GitHub host is authenticated.
- Required action after commit/push: run GitHub Actions from the repository using either the Actions tab or `gh workflow run` after `gh auth login`.

## Clean Workspace Strategy

The original local workspace contains generated duplicate vendor artifacts with `* 2*` names. Direct Composer install in the original `vendor` trees can fail on those duplicate files. To avoid deleting or reverting user files, the baseline used a clean temp copy excluding `vendor`, `node_modules`, build output, logs, and duplicate `* 2*` artifacts.

Clean workspace used:

- `/tmp/project_sso_ci.GAC8kF`

## CI Findings Fixed

- GitHub Actions backend job now prepares Laravel runtime directories before Pint/PHPStan/Pest:
  - `storage/app`
  - `storage/framework/cache`
  - `storage/framework/sessions`
  - `storage/framework/testing`
  - `storage/framework/views`
  - `storage/logs`
  - `bootstrap/cache`
- `sso-frontend` no longer exposes direct public ZITADEL bindings to the browser bundle.
- Password reset and registration entry points now go through server-side local routes:
  - `/auth/password-reset`
  - `/auth/register`
- `sso-frontend` browser storage guard is clean: no `localStorage.setItem`, `sessionStorage.setItem`, or `document.cookie` writes in frontend code.
- `sso-frontend` build no longer depends on fetching Google Fonts during CI.
- Next.js advisories were cleared by upgrading:
  - `next` to `16.2.4`
  - `eslint-config-next` to `16.2.4`
- `app-a-next` Vite advisory was cleared by moving `vitest` to `^4.1.4`.

## Local CI-Equivalent Evidence

Backend:

- `services/sso-backend`
  - Composer install: PASS
  - Pint: PASS
  - PHPStan level 5: PASS
  - Pest: PASS, 208 passed, 2 skipped, 770 assertions
- `apps/app-b-laravel`
  - Composer install: PASS
  - Pint: PASS
  - PHPStan level 5: PASS
  - Pest: PASS, 50 passed, 2 skipped, 180 assertions

Frontend:

- `services/sso-frontend`
  - Typecheck: PASS
  - ESLint plus broker-boundary/browser-storage guards: PASS
  - Vitest: PASS, 100 passed
  - Production build: PASS, 30 app routes generated
  - `npm audit --audit-level=high`: PASS, 0 vulnerabilities
- `services/sso-admin-vue`
  - Typecheck: PASS
  - Oxlint/ESLint: PASS
  - Vitest: PASS, 2 passed
  - Production build: PASS
  - `npm audit --audit-level=high`: PASS, 0 vulnerabilities
- `apps/app-a-next`
  - Typecheck: PASS
  - ESLint plus broker-boundary/browser-storage guards: PASS
  - Vitest: PASS, 28 passed
  - Production build: PASS
  - `npm audit --audit-level=high`: PASS, 0 vulnerabilities

DevOps lifecycle:

- `make validate-devops`: PASS, 0 failure, 0 warning
- Workflow YAML parse: PASS for all `.github/workflows/*.yml`
- Docker Scout action tag verified: `docker/scout-action@v1.20.4`
- CodeQL SARIF upload action tag verified: `github/codeql-action@v4`

## Not Executed Locally

- Remote GitHub Actions run: blocked by missing Git checkout and missing GitHub CLI authentication.
- Docker image build and push: blocked locally because Docker daemon/Colima socket is not running.
- Terraform, Ansible, and Helm executable validation: tools are not installed locally. The repository has static lifecycle coverage and a GitHub workflow for these validations.

## Zero-Downtime Lifecycle Position

This CI-first change is safe for zero downtime because it does not deploy or restart live services. The release path remains:

1. Build immutable image tags.
2. Publish SBOM/provenance and container scan evidence.
3. Deploy through environment-gated CD.
4. Keep Vue admin as path-isolated canary.
5. Run smoke checks before promotion.
6. Trigger rollback automatically on deploy smoke failure or manually through rollback workflow with explicit target tag.

## Remaining Actions

1. Convert this folder into the actual Git checkout or copy these changes into the repository checkout.
2. Authenticate GitHub CLI with write access, or trigger from GitHub Actions UI.
3. Ensure GitHub repository settings/secrets are ready:
   - `DOCKERHUB_USER`
   - `DOCKERHUB_TOKEN`
   - GHCR package permissions
   - Code scanning/SARIF availability for the repository type
4. Run the real remote CI.
5. Review image build, SBOM/provenance, Docker Scout SARIF, and deployment gates before any VPS update.

## Official References Used

- GitHub Actions manual workflow runs: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- GitHub CLI `gh workflow run`: https://cli.github.com/manual/gh_workflow_run
- GitHub SARIF upload: https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/uploading-a-sarif-file-to-github
- Docker build attestations: https://docs.docker.com/build/ci/github-actions/attestations/
- Docker Scout action: https://github.com/docker/scout-action
