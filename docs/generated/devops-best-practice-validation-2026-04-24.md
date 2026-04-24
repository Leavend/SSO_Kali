# DevOps Best-Practice Validation - 2026-04-24

## Scope

This evidence pack validates that Project SSO has an automated software lifecycle for build, test, security gating, release, rollback, and observability after the primary `sso-frontend` rebuild from Next.js to Vue 3 + Vite.

## Reference Baseline

- GitHub Actions OIDC: prefer short-lived deployment credentials over long-lived cloud secrets.
- Docker BuildKit attestations: publish provenance and SBOM attestations for container images; do not pass secrets through build args because provenance can expose them.
- Docker Compose lifecycle: use healthchecks and `depends_on.condition: service_healthy` where dependency readiness matters.
- Kubernetes Deployment lifecycle: rolling updates, rollout status, revision history, and rollback are the target model for strict zero-downtime promotion.

## Automated Gates Added

`scripts/validate-sso-frontend-vue-lifecycle.sh` now proves:

- The primary SSO frontend is locked to Vue 3.5.33, Vite 8.0.10, Vue Router 5.0.6, Pinia 3.0.4, and `@vitejs/plugin-vue` 6.0.6.
- `next`, `react`, and `react-dom` are removed from the primary SSO frontend dependency graph.
- The Node BFF owns `/auth/login`, `/auth/callback`, `/auth/refresh`, `/api/session`, `/api/admin/*`, and `/healthz`.
- PKCE generation, ID token verification, encrypted session cookies, and admin API proxying remain server-side.
- Browser code does not write tokens to local storage, session storage, or `document.cookie`.
- The Dockerfile builds from lockfile, runs production build, drops root, and starts the compiled BFF.
- Compose, CI, and direct VPS deploy all pass `VITE_SSO_BASE_URL`, `VITE_ADMIN_BASE_URL`, and `VITE_CLIENT_ID`.
- Direct VPS deploy creates rollback tags, updates only touched services, preserves two frontend replicas, waits for all expected replicas to become healthy, and smokes HTTPS through local reverse proxy resolution.

The DevOps lifecycle workflow now also triggers when `services/sso-frontend/**` changes.

## Validation Evidence

Local validation passed:

- `./scripts/validate-sso-frontend-vue-lifecycle.sh`
- `./scripts/validate-devops-lifecycle.sh`
- `./scripts/validate-laravel-vue-lifecycle.sh`
- `./infra/sre/check-coexistence-policy.sh`
- `./infra/sre/check-zero-downtime-migration-policy.sh`
- `./infra/sre/check-observability-assets.sh`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke`
- `docker compose --env-file .env.dev.example -f docker-compose.dev.yml config --services`
- `terraform fmt -check -recursive`
- `terraform init -backend=false`
- `terraform validate`
- `ansible-playbook --syntax-check playbooks/devops-preflight.yml`
- `helm lint charts/sso-prototype`
- `docker buildx build --load -t sso-dev-sso-frontend:buildx-validate ... services/sso-frontend`
- Runtime container smoke for `sso-dev-sso-frontend:buildx-validate`: `/healthz` and `/dashboard` returned HTTP 200.

Live VPS validation completed:

- GitHub Actions CI: `40a46b8f54254790c1a2ca15b6507e16739e991e` completed successfully.
- DevOps Lifecycle workflow: `40a46b8f54254790c1a2ca15b6507e16739e991e` completed successfully.
- Direct VPS deploy tag: `direct-20260424204601-40a46b8`.
- Rollback image tag: `rollback-direct-20260424204601-40a46b8`.
- VPS deploy log: `/var/log/sso-direct-build-deploy-20260424124602.log`.
- Post-deploy smokes returned HTTP 200 for discovery, root admin panel, and Vue admin canary.
- `sso-frontend` and `sso-admin-vue` were scaled to two healthy replicas each using the same immutable tag.
- Scale monitor returned 9/9 HTTP 200 samples during replica expansion.

## Lifecycle Assessment

| Area | Status | Evidence |
| --- | --- | --- |
| Version control and CI | Pass | GitHub Actions CI runs frontend/backend QA, Docker image builds, image scanning, provenance, and SBOM gates. |
| Container lifecycle | Pass | Node 22 image, lockfile install, non-root runtime, health endpoint, immutable image tags. |
| Release control | Pass | CD has production environment gate and does not cancel in-flight deployments. |
| Rollback | Pass | Manual rollback workflow and VPS rollback script require explicit target tag. Direct deploy creates rollback image tags. |
| Zero-downtime update | Conditional pass | Live topology now has two healthy frontend replicas and direct deploy preserves that scale. The first single-replica Compose recreate produced one observed non-200 sample, so strict zero downtime is only accepted for future promotions after a multi-replica/blue-green rollout test is green. |
| IaC and config management | Pass in CI | Terraform, Ansible, and Helm static validation are wired into GitHub Actions. |
| Observability | Pass | Prometheus rules, Grafana dashboards, Alertmanager receivers, and KPI exporter validation are present. |
| Secret management | Partial | Runtime secrets are environment-driven; build args are public Vite config only. Next maturity step is Vault/OIDC-backed secret retrieval for deployment credentials. |
| GitOps and orchestration | Partial | Helm chart validation exists. Full GitOps requires ArgoCD or equivalent cluster reconciliation once Kubernetes is the deployment target. |

## Residual Risk

- Colima/Docker, Terraform, Ansible, Helm, Docker Compose, and Docker Buildx are now active on the workstation and were used for local validation.
- The first direct deploy ran from a single-replica Compose state and produced one observed root-route non-200 sample while recreating `sso-frontend`. Runtime was immediately recovered by health gates and smoke tests, and live frontend services are now two-replica/healthy to reduce this risk on the next promotion.
- Compose still does not provide the same formal rollout guarantees as Kubernetes Deployments. For production-grade strict zero downtime, keep the two-replica Compose posture as the VPS floor and move the release controller to blue/green routing or Kubernetes rolling updates with `maxUnavailable=0`.
