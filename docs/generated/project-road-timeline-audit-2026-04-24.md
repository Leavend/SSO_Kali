# Project Road Timeline Audit

Date: 2026-04-24

Scope:
- monorepo structure
- source-code folder topology
- ADRs, contracts, runbooks, CI/CD workflows, and test evidence

## Executive Summary

The project timeline is **not fully represented by the current README**.
`README.md` still describes the platform as if it had only completed Phase 1-4,
while the source tree shows that the project has already progressed into:

- identity contract standardization
- admin control-plane hardening
- observability and zero-downtime operations
- MFA canary readiness and enforcement
- hosted login branding / localization
- CI/CD, rollback, backup, and release-gate automation

The repository already contains enough evidence to reconstruct a credible project
timeline from the code itself.

## Method Used

This audit infers the roadmap from:

- root deployment and compose files
- folder topology under `services/`, `apps/`, `infra/`, `tools/`
- ADR dates and subjects under `docs/adr/`
- generated audit documents under `docs/generated/`
- runbooks under `docs/runbooks/`
- QA / evidence packs under `test-results/`
- GitHub workflow automation under `.github/workflows/`

## Key Finding

The project has effectively moved through **8 major delivery eras**:

1. Foundation and monorepo bootstrap
2. Core broker OIDC platform
3. Downstream application integration
4. Admin control plane and policy hardening
5. Identity normalization and contract discipline
6. Operational hardening, observability, and zero-downtime posture
7. MFA, release gates, and production-readiness automation
8. Hosted login branding, localization, and UX precision

## Reconstructed Road Timeline

### Era 1 — Foundation & Platform Bootstrap

Evidence:
- `services/sso-backend`
- `services/sso-frontend`
- `apps/app-a-next`
- `apps/app-b-laravel`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `charts/sso-prototype`

What was delivered:
- monorepo with broker, admin UI, and two demo clients
- Docker-based local/dev orchestration
- Helm / deployment scaffolding
- baseline documentation and bootstrap scripts

Interpretation:
- this is the original platform-construction stage described in the README as Phase 1-4

### Era 2 — Broker OIDC Core

Evidence:
- `services/sso-backend/app/Actions/Oidc`
- `services/sso-backend/app/Services/Oidc`
- `services/sso-backend/routes/web.php`

What was delivered:
- discovery, authorize, token, revocation, userinfo, JWKS
- broker callback flow to ZITADEL
- authorization code + PKCE broker pattern
- local token issuance and session registration
- centralized logout primitives

Interpretation:
- this is the point where the SSO system stopped being scaffold-only and became a working OIDC broker

### Era 3 — Downstream Client Integration

Evidence:
- `apps/app-a-next/src/lib/oidc.ts`
- `apps/app-a-next/src/lib/session-store.ts`
- `apps/app-b-laravel/app/Actions/Auth/*`
- `apps/app-b-laravel/app/Services/Sso/*`
- `docs/testing/app-a-slo-fanout-e2e.md`

What was delivered:
- App A as public client
- App B as confidential client
- local session persistence in both clients
- back-channel logout handling in both clients

Interpretation:
- the architecture matured from “SSO broker demo” into “ecosystem integration platform”

### Era 4 — Admin Control Plane & High-Assurance Access

Evidence:
- `services/sso-backend/routes/admin.php`
- `services/sso-frontend/src/app/dashboard`
- `services/sso-frontend/src/app/sessions`
- `services/sso-frontend/src/app/users`
- `docs/adr/ADR-high-assurance-admin-access.md`
- `docs/security/admin-session-management-rbac.md`
- `docs/contracts/admin-api-contract.md`

What was delivered:
- admin API and admin portal
- freshness requirements
- RBAC layering
- destructive-action protection
- explicit error taxonomy such as `reauth_required`, `forbidden`, `too_many_attempts`, `mfa_required`

Interpretation:
- this is where the platform became an operator-facing control plane, not just a broker

### Era 5 — Identity Contract & Policy Discipline

Evidence:
- `docs/adr/ADR-identity-keying-and-types.md`
- `docs/adr/ADR-identifier-resolution-policy.md`
- `docs/contracts/db-schema-identity-contract.md`
- `docs/contracts/identifier-resolver-spec.md`
- `docs/generated/phase-21-access-identity-policy-pack.md`
- `docs/migrations/identity-subject-id-migration-strategy.md`

What was delivered:
- canonical `(issuer, subject_id)` identity contract
- deprecation of UUID assumptions
- alias-resolution policy for email / username / NISN / NIP
- database and API contract discipline

Interpretation:
- this is a governance phase where the team standardized identity semantics before scaling feature complexity

### Era 6 — Operational Hardening & SRE Discipline

Evidence:
- `infra/nginx`
- `infra/traefik`
- `infra/sre`
- `docs/runbooks/*`
- `docs/adr/ADR-vps-coexistence-strategy.md`
- `docs/adr/ADR-telescope-debug-subdomain.md`
- `docs/adr/ADR-phase35-deep-dive-hardening.md`

What was delivered:
- Nginx -> Traefik chained proxy model
- zero-downtime rollout / rollback policy
- forwarded-header validation
- Telescope isolation strategy
- queue worker support
- backup / restore drill tooling

Interpretation:
- this is the stage where the project crossed from app-development into SRE-managed service operation

### Era 7 — Release Gates, Observability, MFA, and Recovery

Evidence:
- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml`
- `.github/workflows/rollback.yml`
- `.github/workflows/*gate*.yml`
- `infra/observability`
- `infra/backup`
- `docs/testing/*`
- `docs/runbooks/admin-mfa-canary-activation.md`

What was delivered:
- CI + image build + GHCR publishing
- zero-downtime CD and rollback workflows
- KPI verification gates
- cookie, JWKS, logout, Argon2id, proxy-chain quality gates
- MFA readiness and canary rollout procedures
- scheduled backup restore drill

Interpretation:
- this is a release-engineering and reliability maturity phase

### Era 8 — Hosted Login Branding, Localization, and UX Precision

Evidence:
- `infra/zitadel-login/*`
- `infra/zitadel/apply-dev-sso-branding.sh`
- `infra/zitadel/apply-dev-sso-language-policy.sh`
- `docs/contracts/zitadel-login-copywriting.md`
- `docs/runbooks/zitadel-branding-policy.md`
- `test-results/phase34-zitadel-branding-20260412`
- `test-results/phase34-login-experience-20260412-final`
- `test-results/hosted-login-*`

What was delivered:
- Dev-SSO branding over self-hosted ZITADEL login
- custom copy catalog and residual patch layers
- Indonesian and English-only language policy
- theme toggle validation
- hosted login smoke / responsive / locale validation

Interpretation:
- this is the experience-polish stage after the core IAM and security layers were already in place

## Current State of the Project

Based on the source tree, the project is **not an early prototype anymore**.
It is better described as:

- a dev/staging-grade identity platform
- with enterprise-style control-plane hardening
- with explicit contracts and runbooks
- and with growing release automation and operational safety nets

The word “prototype” still appears in some files and names, but the repository
has already entered a **productionization track**.

## Timeline Mismatch That Should Be Fixed

### README is behind the real roadmap

Current issue:
- `README.md` only enumerates Phase 1-4

Reality:
- the repo contains evidence of at least Phase 21, 26, 27, 31, 34, 35, 36, and 37

Impact:
- onboarding becomes harder
- roadmap discussions drift into memory instead of source-of-truth
- release scope becomes harder to explain to non-authors

## Recommended Roadmap Model Going Forward

Use the following milestone bands as the official project narrative:

### Milestone A — Core Identity Platform

- monorepo
- broker
- ZITADEL integration
- App A / App B
- centralized logout

### Milestone B — Secure Admin Control Plane

- admin portal
- RBAC
- freshness
- audit taxonomy
- identity contract normalization

### Milestone C — Productionization

- zero-downtime deploy
- rollback
- observability
- backup / restore
- release gates
- MFA policy and canary rollout

### Milestone D — Experience & Brand

- hosted login branding
- localization
- UI precision
- error taxonomy UX

## Best-Practice Recommendations

### 1. Create a single source-of-truth roadmap file

Recommended location:
- `docs/roadmap/project-roadmap.md`

It should track:
- milestone
- phase number
- objective
- status
- linked ADR / contract / runbook / evidence

### 2. Stop using README as the only phase reference

README should summarize only:
- current architecture
- current maturity level
- link to full roadmap

### 3. Normalize phase numbering

The repo currently contains:
- explicit low phases in README
- explicit mid/high phases in generated docs and evidence folders

This suggests timeline drift.
Future phase naming should be recorded in one machine-readable place.

### 4. Separate “project maturity” from “feature phase”

Recommended distinction:
- maturity lane: prototype -> staging-grade -> productionization -> hardening -> polish
- delivery lane: phase 1, phase 2, ..., phase N

That separation will make planning clearer.

## Final Assessment

The issue is solvable, and the source tree already provides enough evidence.

The real road timeline of this project is:

- **foundation**
- **OIDC broker implementation**
- **downstream app integration**
- **admin control-plane hardening**
- **identity and policy standardization**
- **operational and release hardening**
- **MFA / observability / recovery readiness**
- **hosted login UX and branding refinement**

The main gap is no longer missing capability.
The main gap is **timeline documentation drift**.
