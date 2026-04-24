# DevOps SSO Integration Validation - 2026-04-24

## Scope

Tujuan fase ini adalah memperkuat DevOps control plane Project SSO agar alur
development, testing, deploy, rollback, dan update tetap cepat tetapi aman.

Prinsip lifecycle yang dipakai:

1. zero downtime
2. rollback mechanism
3. update zero downtime

Tidak ada perubahan runtime live VPS pada fase ini. Perubahan difokuskan pada
repository, CI/CD, IaC foundation, configuration-management preflight, dan
release guardrail.

## Research Basis

Primary references:

- GitHub Actions secure use reference: https://docs.github.com/en/actions/reference/security/secure-use
- Docker Build GitHub Actions: https://docs.docker.com/build/ci/github-actions/
- Docker Scout supply-chain scanning guide: https://docs.docker.com/guides/docker-scout/
- Terraform recommended practices: https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices
- Ansible tips and best practices: https://docs.ansible.com/projects/ansible/latest/tips_tricks/ansible_tips_tricks.html
- Kubernetes Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- Prometheus alerting rules: https://prometheus.io/docs/prometheus/3.5/configuration/alerting_rules/

Applied principles:

- Keep GitHub Actions `GITHUB_TOKEN` least-privilege by default.
- Use immutable image tags, SBOM/provenance attestations, and deterministic
  promotion.
- Keep infrastructure and automation in version control.
- Validate changes before production by syntax, policy, smoke, and SLO gates.
- Use rolling/canary release paths before wider promotion.
- Treat alerting and observability as release gates, not only dashboards.

## Changes Implemented

### CI/CD

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml`
- `.github/workflows/rollback.yml`
- `.github/workflows/devops-lifecycle.yml`

Implemented:

- CI default permission reduced to `contents: read`.
- Image build job gets scoped permissions only where needed:
  - `packages: write`
  - `id-token: write`
  - `attestations: write`
- Docker image builds now emit:
  - SBOM attestation
  - max provenance attestation
- CD now syncs the Compose control-plane file to VPS before deploy.
- CD backs up the previous remote Compose file before installing the new one.
- Rollback workflow prepares the remote rollback script directory before rsync.
- New DevOps lifecycle workflow validates:
  - repository lifecycle contract
  - Terraform static validation
  - Ansible syntax
  - Helm chart lint
  - SRE coexistence policy
  - zero-downtime migration policy
  - observability assets

### Zero-Downtime Deploy/Rollback

Files:

- `scripts/vps-deploy.sh`
- `scripts/vps-rollback.sh`

Implemented:

- Deploy now preflights the live Compose control plane before pulling images,
  migrating, or replacing services.
- Rollback now preflights the live Compose control plane before replacing
  containers.
- Both scripts fail early if required services such as `sso-admin-vue` are not
  defined by the remote Compose file.

Why this matters:

- Previous live VPS investigation found the VPS did not yet contain
  `sso-admin-vue` in `/opt/sso-prototype-dev`.
- The new CD sync step and script preflight close that lifecycle gap.
- Failed control-plane alignment now stops before a partial rollout.

### Terraform Foundation

Files:

- `infra/terraform/environments/dev-sso/versions.tf`
- `infra/terraform/environments/dev-sso/variables.tf`
- `infra/terraform/environments/dev-sso/main.tf`
- `infra/terraform/environments/dev-sso/outputs.tf`
- `infra/terraform/environments/dev-sso/terraform.tfvars.example`
- `infra/terraform/environments/dev-sso/README.md`

Implemented:

- Provider-neutral Terraform catalog for the Dev SSO runtime surface.
- Zero-downtime release contract encoded as data:
  - canary-first deployment
  - immutable image tag
  - rollback required
  - smoke required
  - route priority contract
- Planned provider surfaces for DNS and firewall policy.

Why provider-neutral first:

- No cloud/DNS provider credentials were supplied.
- This avoids accidental infrastructure mutation while establishing the
  contract that future provider-backed resources must follow.

### Ansible Foundation

Files:

- `infra/ansible/ansible.cfg`
- `infra/ansible/inventory/dev-sso.ini.example`
- `infra/ansible/group_vars/sso_vps.yml`
- `infra/ansible/playbooks/devops-preflight.yml`
- `infra/ansible/README.md`

Implemented:

- Read-only VPS preflight playbook.
- Checks Docker, Docker Compose, Nginx, firewall inspection, project directory,
  Compose control-plane file, required Compose services, SSO health endpoint,
  OIDC discovery, and Vue canary health.

This gives Ansible a safe first role: detect drift before configuration
management becomes mutating.

### Developer Entry Point

File:

- `Makefile`

Implemented:

- Added `make validate-devops`, combining:
  - DevOps lifecycle validator
  - Laravel/Vue lifecycle validator
  - coexistence policy
  - zero-downtime migration policy
  - observability asset validation

## Requested Toolchain Fit

| Domain | Tool | Current decision |
| --- | --- | --- |
| VCS | Git | Use as source of truth; local folder itself is not a git checkout, but repo artifacts are structured for GitHub. |
| VCS Hosting | GitHub | Already primary CI/CD host. |
| CI/CD | GitHub Actions | Hardened and expanded with DevOps lifecycle workflow. |
| Containers | Docker | Kept as current VPS runtime baseline. |
| Reverse Proxy | Nginx + Traefik | Kept; policy checks already validate coexistence and route priority. |
| Forward Proxy | Forward proxy | Not core to current SSO runtime; keep as future egress-control phase. |
| Caching Server | Redis | Present in Compose and monitored through lifecycle policy. |
| Firewall | ufw/nftables | Added Ansible read-only inspection baseline; mutating rules remain future gated work. |
| Provisioning | Terraform | Added provider-neutral control-plane foundation. |
| Configuration Management | Ansible | Added read-only VPS preflight foundation. |
| Logs Management | Elastic Stack | Defer until log-search pain or retention requirement is explicit. |
| Monitoring | Prometheus/Grafana | Already present; now wired into DevOps lifecycle workflow. |
| Monitoring SaaS | Datadog | Defer; avoid duplicating Prometheus/Grafana before an org-wide standard exists. |
| Secret Management | Vault | Defer as implementation; first finish secret taxonomy, GitHub environment protection, and rotation discipline. |
| Orchestration | Kubernetes | Keep Helm chart validated; do not move runtime until VPS Compose maturity is green. |
| Artifact Management | Artifactory | Defer; GHCR is currently enough for container artifacts. |
| GitOps | ArgoCD | Defer until Kubernetes is actual runtime. |
| Service Mesh | Istio/Consul | Defer; service-mesh overhead is not justified for current VPS topology. |
| Cloud Design Patterns | Availability, data, implementation, management, monitoring | Encoded into zero-downtime release contract, CD/rollback, observability checks, and future Terraform surfaces. |

## Validation Results

Executed locally:

| Command | Result |
| --- | --- |
| `bash -n scripts/validate-devops-lifecycle.sh` | PASS |
| `bash -n scripts/vps-deploy.sh` | PASS |
| `bash -n scripts/vps-rollback.sh` | PASS |
| YAML parse for workflows and Ansible files | PASS |
| `./scripts/validate-devops-lifecycle.sh` | PASS, 0 failures, 1 warning |
| `./scripts/validate-laravel-vue-lifecycle.sh --strict-target` | PASS, 0 failures, 0 warnings |
| `./infra/sre/check-coexistence-policy.sh` | PASS |
| `./infra/sre/check-zero-downtime-migration-policy.sh` | PASS |
| `./infra/sre/check-observability-assets.sh` | PASS |
| `make validate-devops` | PASS |

Local tools not installed, so direct local execution was not performed:

- `terraform`
- `ansible-playbook`
- `helm`

Those validations are configured in GitHub Actions through the new
`DevOps Lifecycle` workflow.

## Remaining Controlled Gap

Only one lifecycle validator warning remains:

- container vulnerability scanning is not yet integrated

Recommended next decision:

- Prefer Docker Scout or an equivalent scanner with explicit credential and
  supply-chain policy.
- Add it as a CI gate only after deciding:
  - scanner provider
  - severity threshold
  - SARIF/code-scanning upload policy
  - whether scans are advisory or blocking for `main`

This is intentionally not bolted on blindly because CI security scanners become
part of the supply chain and need the same trust model as deploy actions.

## Final Assessment

The Project SSO DevOps layer is now stronger in the areas that matter most for
the current VPS-based lifecycle:

- CI/CD is more least-privilege and artifact-aware.
- Images now carry SBOM and provenance attestations.
- CD closes the previously discovered VPS control-plane sync gap.
- Deploy and rollback fail early on Compose drift.
- Terraform and Ansible foundations are present without unsafe infrastructure
  mutation.
- Prometheus/Grafana/SRE checks are first-class CI gates.
- Kubernetes/Helm is validated as a future migration path, not prematurely used
  as the live runtime.

