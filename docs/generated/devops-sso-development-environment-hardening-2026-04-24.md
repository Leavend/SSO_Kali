# DevOps SSO Development Environment Hardening - 2026-04-24

## Scope

Fase ini melanjutkan rekomendasi DevOps untuk environment development SSO.
Fokusnya adalah menyempurnakan gate yang sebelumnya masih tersisa agar alur
development -> testing -> deploy tetap cepat, terukur, dan reversible.

Prinsip lifecycle:

- zero downtime
- rollback mechanism
- update zero downtime

Tidak ada deploy atau perubahan runtime live VPS pada fase ini.

## Research Basis

Primary references:

- GitHub Actions secure use reference: https://docs.github.com/en/actions/reference/security/secure-use
- GitHub SARIF upload reference: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github
- Docker Build attestations: https://docs.docker.com/build/ci/github-actions/attestations/
- Docker Scout GitHub Action: https://github.com/docker/scout-action
- Docker Scout CVE command reference: https://docs.docker.com/reference/cli/docker/scout/cves/

Applied interpretation:

- Use least privilege in GitHub Actions.
- Keep SBOM/provenance on built images.
- Add vulnerability scanning as evidence first in development.
- Upload SARIF to GitHub Code Scanning for visibility.
- Keep scanning pre-deploy so it does not affect the VPS traffic switch path.

## Changes Implemented

### Container Vulnerability Scanning

File:

- `.github/workflows/ci.yml`

Implemented:

- Added `security-events: write` only to the image build job.
- Added a deterministic primary image reference after metadata generation.
- Added Docker Scout CVE scanning for `critical,high` fixable CVEs.
- Added SARIF upload through GitHub Code Scanning.
- Kept scan as advisory with `continue-on-error: true` during the first
  development baseline.

Reason:

- Development should surface CVE evidence without blocking all delivery before
  the current image baseline is known.
- Blocking mode can be enabled after the baseline is fixed or explicitly
  waived.

### Scanning Policy

File:

- `docs/security/container-image-scanning-policy.md`

Implemented:

- Defined image scope.
- Defined advisory mode for development.
- Defined promotion criteria to blocking mode.
- Defined zero-downtime relationship.
- Defined Docker Scout credential expectations.
- Reiterated that secrets must not be passed via Docker build args because max
  provenance can expose build argument values.

### Development Environment Alignment

File:

- `.env.dev.example`

Implemented:

- Added `SSO_ADMIN_VUE_BASE_PATH=/__vue-preview`.

Reason:

- The Compose control plane already supports the Vue canary path.
- The development env example now exposes the same path explicitly, avoiding
  drift between local Compose, CI/CD, and VPS release expectations.

### Lifecycle Validator

File:

- `scripts/validate-devops-lifecycle.sh`

Implemented:

- Added checks for:
  - container scanning policy document
  - `security-events: write`
  - pinned Docker Scout action
  - SARIF upload action
  - development env Vue canary base path
- DevOps lifecycle validator now completes with 0 failures and 0 warnings.

## Zero-Downtime Position

Scanning happens before deploy. The deploy path remains:

1. Build image.
2. Attach SBOM/provenance.
3. Scan image.
4. Publish evidence.
5. Deploy immutable image tag.
6. Smoke test.
7. Roll back by tag if smoke fails.

No scanning task is added to the VPS traffic switch path.

## Rollback Position

Rollback remains image-tag based.

The latest hardening keeps rollback safe because:

- scanning does not mutate runtime state
- deploy script preflights Compose services
- rollback script preflights Compose services
- CD syncs Compose control plane before deploy
- `APP_IMAGE_TAG` remains deterministic

## Validation Results

Executed locally:

| Command | Result |
| --- | --- |
| `./scripts/validate-devops-lifecycle.sh` | PASS, 0 failures, 0 warnings |
| YAML parse for workflows and Ansible files | PASS |
| `bash -n scripts/validate-devops-lifecycle.sh scripts/vps-deploy.sh scripts/vps-rollback.sh` | PASS |
| `make validate-devops` | PASS |

`make validate-devops` also ran:

- Laravel/Vue lifecycle strict target
- SRE coexistence policy
- zero-downtime migration policy
- observability asset validation

All passed.

Local workstation note:

- `terraform`, `ansible-playbook`, and `helm` are not installed locally.
- Their validations are configured to run in GitHub Actions through
  `.github/workflows/devops-lifecycle.yml`.
- Docker CLI exists locally, but the Docker daemon is not running in this
  workstation session.

## Remaining Operational Decision

The development environment now has a complete advisory DevSecOps baseline.

Next decision before making scanning blocking:

1. Configure Docker Scout authentication through GitHub secrets if needed:
   - `DOCKERHUB_USER`
   - `DOCKERHUB_TOKEN`
2. Run one CI image build to capture the first CVE baseline.
3. Decide blocking threshold:
   - critical fixable CVEs only, or
   - critical + high fixable CVEs
4. Decide waiver format for accepted dev-only risk.
5. Flip scan mode from advisory to blocking after baseline approval.

## Final Assessment

The Development SSO DevOps environment now has:

- CI image SBOM/provenance
- CVE scanning evidence
- SARIF upload path
- zero-downtime deploy gate
- rollback preflight
- Compose control-plane sync
- Terraform foundation
- Ansible preflight foundation
- Helm static validation in CI
- Prometheus/Grafana/SRE policy validation
- a single local command: `make validate-devops`

This is now a strong development-grade DevOps baseline. The remaining step is
not more tooling, but running the first CI baseline and deciding when security
scanning should become a blocking promotion gate.
