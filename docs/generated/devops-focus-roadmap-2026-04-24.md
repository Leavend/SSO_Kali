# DevOps Focus Roadmap

Date: 2026-04-24

Scope:
- current DevOps maturity in the repository
- fit analysis for requested DevOps stack
- recommended execution focus for this week

## Executive Summary

The project already has a **strong DevOps baseline**:

- GitHub Actions CI/CD
- Docker-based delivery
- zero-downtime deploy scripts
- reverse proxy chaining with Nginx and Traefik
- Prometheus + Grafana observability assets
- release gates, rollback workflow, and backup-restore drill automation

The main risk now is **tool sprawl**.
If every DevOps technology is integrated immediately, delivery speed will slow down instead of improving.

The best-practice approach for this week is:

1. strengthen the current control plane
2. add missing foundational IaC / provisioning layers
3. avoid premature platform complexity

## Current DevOps Capability Audit

| Domain | Requested Stack | Current State in Repo | Fit for This Project Now | Recommendation |
|---|---|---|---|---|
| Version Control | Git | Present and central | High | Keep as primary source of truth |
| VCS Hosting | GitHub | Present | High | Keep |
| CI/CD | GitHub Actions | Strongly present | High | Expand and harden |
| Containers | Docker | Strongly present | High | Keep as runtime baseline |
| Reverse Proxy / LB | Reverse Proxy | Strongly present with Nginx -> Traefik | High | Keep and formalize |
| Forward Proxy | Forward Proxy | Not core to current architecture | Low | Do not prioritize this week |
| Caching Server | Redis / broker caches | Present | High | Harden and monitor |
| Firewall | OS / edge firewall discipline | Partial | Medium | Add host-level automation |
| Provisioning | Terraform | Not present | High | Add this week |
| Config Management | Ansible | Not present | High | Add this week |
| Logs Management | Elastic Stack | Not operationally integrated | Medium | Defer unless log search pain is real |
| Monitoring | Prometheus | Present | High | Keep and deepen |
| Monitoring | Grafana | Present | High | Keep and deepen |
| Monitoring | Datadog | Not present | Low-Medium | Defer for now |
| Secret Management | Vault | Not present | Medium | Defer as formal phase, improve secret hygiene first |
| Orchestration | Kubernetes | Partial only via Helm chart | Low-Medium | Do not activate this week |
| Artifact Management | Artifactory | Not present | Low | Keep GHCR instead of adding another registry now |
| GitOps | ArgoCD | Not present | Low | Defer until Kubernetes is real |
| Service Mesh | Istio | Not present | Very Low | Not now |
| Service Mesh | Consul | Not present | Very Low | Not now |
| Cloud Patterns | Availability / monitoring / rollout | Partial and growing | High | Formalize as operating model |

## What Is Already Strong

### 1. CI/CD and release discipline

Evidence already exists for:

- CI pipeline
- CD pipeline
- rollback workflow
- QA / security / release gates

This means the repo is already beyond "basic DevOps" and has entered a release-engineering posture.

### 2. Runtime delivery model

Current strengths:

- Docker Compose based service orchestration
- `deploy.sh` / `deploy-remote.sh` fast deploy flow
- zero-downtime intent
- health-checked services
- queue worker separation

This is a solid delivery model for a VPS-based control plane.

### 3. Observability baseline

Current strengths:

- Prometheus config
- Grafana dashboards
- KPI gates
- admin auth funnel probes
- observability asset linting

This is enough to support further hardening without introducing Datadog immediately.

### 4. Operational recovery posture

Current strengths:

- backup scripts
- restore drill workflow
- rollback workflow
- migration / rollback runbooks

This is a strong sign that the project is already thinking in production operations, not just app delivery.

## Gaps That Are Worth Solving This Week

### Gap A — Infrastructure as Code is still incomplete

Current issue:
- Docker and deploy scripting exist
- but Terraform is not yet the source of truth for infrastructure surfaces such as:
  - VPS resources
  - DNS records
  - firewall/security groups
  - monitoring endpoints

Why this matters:
- infra changes are still more manual than they should be
- drift risk remains

### Gap B — Host provisioning is not yet codified enough

Current issue:
- deployment scripts are strong
- but machine bootstrap / package installation / host hardening are not yet expressed through Ansible

Why this matters:
- server rebuild and disaster recovery remain more human-dependent than ideal

### Gap C — Secret management needs a stepping-stone

Current issue:
- secrets are spread across env files, GitHub secrets, and VPS runtime locations

Why this matters:
- Vault is not the first thing to add
- first, the project needs clearer secret classification and sync discipline

### Gap D — Platform ambition is ahead of platform need

Current issue:
- Kubernetes, ArgoCD, Istio, Consul, Vault, Datadog, and Artifactory are all valid technologies
- but enabling all of them now would create a second project: operating the platform itself

Why this matters:
- current runtime is still a VPS-centered stack
- the project benefits more from **consistency and repeatability** than from control-plane expansion

## Best-Practice Recommendation: What to Do This Week

## Priority 1 — Formalize the current VPS platform

Ship this first:

- Terraform for:
  - DNS
  - VPS metadata / firewall rules
  - monitoring / backup-related infra settings where applicable
- Ansible for:
  - Docker host bootstrap
  - Nginx install and config
  - Docker Compose prerequisites
  - deploy user, directories, permissions, timers, and service policies

Expected outcome:
- faster rebuild
- lower manual drift
- more repeatable deploys

## Priority 2 — Harden the existing CI/CD path

Ship this second:

- standardize promotion flow from CI -> image registry -> VPS deploy
- formalize environment protections in GitHub
- strengthen artifact traceability
- make deploy evidence packs first-class outputs

Expected outcome:
- fewer deploy surprises
- easier rollback confidence

## Priority 3 — Deepen observability before adding new vendors

Ship this third:

- keep Prometheus + Grafana as primary observability stack
- finish alert routing and on-call validation
- improve business KPI / auth KPI coverage
- normalize control-plane logs before choosing Elastic or Datadog

Expected outcome:
- better signal quality
- less tool duplication

## Priority 4 — Raise secret maturity in stages

Ship this fourth:

- classify secrets by sensitivity and ownership
- normalize where they live:
  - GitHub Actions secrets
  - VPS runtime env
  - local development env
- define rotation runbooks and secret provenance

Expected outcome:
- cleaner future path to Vault

## What Should Be Deferred

### Kubernetes

Why defer:
- current production model is still VPS + Docker Compose + Nginx + Traefik
- Kubernetes adds cluster operations overhead before current VPS IaC is complete

Trigger to revisit:
- multi-node requirement
- autoscaling need
- tenant or environment explosion

### ArgoCD

Why defer:
- ArgoCD only becomes high leverage when Kubernetes is the real runtime control plane

### Istio / Consul

Why defer:
- the project does not yet have a service-to-service complexity level that justifies a service mesh

### Artifactory

Why defer:
- GHCR is already a sufficient artifact registry for this repo
- adding Artifactory now duplicates registry responsibility

### Datadog

Why defer:
- Prometheus + Grafana are already present
- Datadog should only be added if the organization wants one commercial observability standard across many systems

### Vault

Why defer as immediate implementation:
- the first need is secret discipline
- Vault is valuable, but it should land after secret taxonomy and provisioning are stabilized

## One-Week Execution Plan

### Day 1 — DevOps inventory and target operating model

- freeze current-state DevOps architecture
- define what remains VPS-native
- define what becomes IaC-managed

### Day 2 — Terraform foundation

- create Terraform root modules for:
  - DNS
  - firewall policy
  - VPS metadata / environment descriptors

### Day 3 — Ansible foundation

- create playbooks / roles for:
  - docker host bootstrap
  - nginx setup
  - deploy directories
  - runtime dependencies

### Day 4 — CI/CD and release hardening

- integrate Terraform / Ansible checks into GitHub Actions
- formalize deployment promotion workflow
- attach evidence outputs to release steps

### Day 5 — Observability and secret maturity

- expand Prometheus / Grafana checks
- audit secret locations and classify them
- define staged path to Vault, without forcing Vault rollout yet

## Recommended Target Stack for This Week

Adopt now:

- Git
- GitHub
- GitHub Actions
- Docker
- Nginx + Traefik
- Prometheus
- Grafana
- Terraform
- Ansible
- GHCR

Keep as future options, not immediate integrations:

- Elastic Stack
- Vault
- Kubernetes
- ArgoCD
- Datadog
- Artifactory
- Istio
- Consul

## Final Assessment

The project does **not** need “all DevOps tools”.
It needs the **right DevOps layers in the right order**.

For this week, the highest-value path is:

1. Terraform
2. Ansible
3. CI/CD hardening on top of the existing GitHub Actions + GHCR + VPS flow
4. stronger observability and secret discipline

That sequence will reduce deploy friction and code-to-production latency far more effectively than jumping straight into Kubernetes, ArgoCD, Vault, or service mesh adoption.
