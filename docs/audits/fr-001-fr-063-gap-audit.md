# FR-001–FR-063 SSO Gap Audit

**Tanggal:** 2026-05-26
**Scope:** `services/sso-backend`, `services/sso-frontend`, `services/sso-admin-frontend`
**Requirement Source:** `docs/requirements/fr_uc_sso_practical_reader.md`
**Reference Audit:** `docs/audits/fr-001-fr-020-gap-audit.md`

## 1. Executive Summary

Audit ini meninjau ulang FR-001 sampai FR-063 dan UC terkait untuk melihat gap tersisa pada backend SSO, portal user, dan admin frontend. Kondisi terkini berbeda dari audit lama: admin frontend aktif berada di `services/sso-admin-frontend`, portal SSO sudah memakai pola BFF/session same-origin, dan backend sudah memiliki coverage luas untuk protokol OIDC, token lifecycle, session/logout, DSR, admin API, RBAC, audit, dan federation.

### Kesimpulan utama

1. **Backend SSO sudah kuat untuk protocol/security core.** Discovery/JWKS, PKCE, token exchange, refresh rotation/reuse detection, revocation, introspection, userinfo, session/logout, admin APIs, DSR automation, external IdP, safe error, dan correlation ID punya production code + test evidence.
2. **Portal frontend sudah kuat untuk user-facing SSO/self-service.** Login, callback BFF, consent allow/deny, MFA enrollment/challenge/recovery, profile, password/reset, sessions, connected apps, DSR intake/status, safe redirect, safe error copy, dan admin-role access-to-portal sudah terimplementasi.
3. **Gap terbesar sekarang adalah admin frontend delivery.** `services/sso-admin-frontend` baru punya session bootstrap, role guard, forbidden page, dan readiness shell. Belum ada dashboard, user lifecycle UI, client management UI, audit/export UI, RBAC/security-policy UI, external IdP admin UI, atau incident/ops UI.
4. **Operational evidence sudah banyak tetapi belum semuanya audit-closed.** Backup/restore runbook, scripts, and workflow exist; JWKS rotation runbook/simulation exist; monitoring dashboards/runbooks exist. Yang masih perlu dilengkapi adalah dated evidence/signoff untuk restore drill, SIEM sink verification, JWKS staging/prod rotation drill, dan DR/failover drill.
5. **Security policy decision yang masih perlu dikunci:** unknown `acr_values` saat ini permissive dan test-backed. Jika target produk menuntut strict OIDC step-up semantics, ini harus dipromosikan menjadi gap High untuk FR-021/FR-060.

## 2. Methodology

Audit dilakukan dengan membandingkan requirement source terhadap evidence repo saat ini:

- Requirements: `docs/requirements/fr_uc_sso_practical_reader.md`
- Audit reference: `docs/audits/fr-001-fr-020-gap-audit.md`
- Backend routes/controllers/services/tests: `services/sso-backend/routes/*`, `services/sso-backend/app/**/*`, `services/sso-backend/tests/**/*`
- Portal frontend source/tests: `services/sso-frontend/src/**/*`, `services/sso-frontend/e2e/**/*`
- Admin frontend source/tests: `services/sso-admin-frontend/src/**/*`, `services/sso-admin-frontend/e2e/**/*`
- Ops/runbook evidence: `.github/workflows/*`, `infra/**/*`, `docs/runbooks/**/*`, `docs/security/**/*`

Status yang digunakan:

- **Implemented:** production code + relevant test/evidence exists.
- **Partial:** core exists, but one or more required surfaces/evidence are incomplete.
- **Backend-only:** backend/API exists but required frontend/admin surface missing.
- **Frontend-only:** UI exists but backend/security boundary evidence missing.
- **Operational evidence missing:** implementation/runbook exists but dated drill/signoff/evidence not verified.
- **Needs verification:** behavior exists but product/security decision or external evidence is not confirmed.
- **Missing:** no sufficient implementation evidence found.

Severity:

- **Critical:** core SSO/security/compliance breakage or exploit-prone missing control.
- **High:** required FR/UC materially incomplete or blocks governance delivery.
- **Medium:** feature works but lacks UI, auditability, configurability, tests, or operational evidence.
- **Low:** naming, docs, polish, or non-blocking evidence gap.

## 3. Coverage Matrix FR-001–FR-063

| FR | Requirement | Status | Service area | Evidence | Gap / next action |
| --- | --- | --- | --- | --- | --- |
| FR-001 | Publikasi OIDC Discovery | Implemented | Backend | `services/sso-backend/routes/oidc.php`, `app/Http/Controllers/Oidc/DiscoveryController.php`, `app/Services/Oidc/OidcCatalog.php`, `tests/Feature/Oidc/DiscoveryDocumentTest.php` | Keep endpoint contract tests current after route changes. |
| FR-002 | Publikasi JWKS Signing Key | Implemented / operational drill monitored | Backend + Ops | `routes/oidc.php`, `JwksController.php`, `SigningKeyService.php`, `docs/security/jwks-caching-rotation-runbook.md`, `.github/workflows/jwks-rotation-simulation.yml` | Attach dated staging/prod JWKS rotation drill evidence. |
| FR-003 | Ketersediaan Discovery & JWKS | Implemented / operational evidence monitored | Backend + Ops | `routes/oidc.php`, `ApplyPublicCacheToMetadata`, `HandleDiscoveryErrors`, `docs/runbooks/on-call-observability-runbook.md`, Prometheus/Grafana assets under `infra/observability` | Keep SLI smoke/drill evidence for discovery/JWKS availability. |
| FR-004 | Registry Scope, Claim & Algorithm | Implemented / monitored | Backend + Portal | `OidcCatalog.php`, scope policy tests, `services/sso-frontend/src/lib/oidc/scope-labels.ts`, `ConsentPage.vue` | Maintain backend/frontend scope-label parity as custom scopes grow. |
| FR-005 | Konsistensi Issuer & Endpoint | Implemented | Backend + Portal | `routes/oidc.php`, `OidcCatalog.php`, `PublicEndpointContractTest.php`, portal discovery/canonicalization utilities | Re-run contract after deploy path or issuer changes. |
| FR-006 | Kelola Client Aplikasi oleh Admin | Backend-only | Backend + Admin frontend | `services/sso-backend/routes/admin.php`, `ClientController.php`, `AdminClientIntegrationContractTest.php`; admin frontend has no client UI | Build `sso-admin-frontend` client list/create/update screens. |
| FR-007 | Validasi Tipe Client & Auth Token Endpoint | Implemented | Backend | `TokenController.php`, token client auth resolver/action coverage, discovery auth-method tests | Keep confidential/public client auth contract tests. |
| FR-008 | Validasi Redirect URI Exact Match | Implemented backend; admin UI missing | Backend + Admin frontend | `AuthorizationRequestValidator.php`, `UpdateManagedClientRequest.php`, route/admin client tests | Add admin UI for redirect/logout URI editing and validation feedback. |
| FR-009 | Siklus Hidup Client Secret | Partial | Backend + Admin frontend | `RotateClientSecretAction.php`, `ClientController::rotateSecret`, client secret lifecycle tests | Add admin UI for rotation and verify dual-secret/grace-period policy if required. |
| FR-010 | Validasi Logout URI Client | Implemented backend; admin UI missing | Backend + Admin frontend | `UpdateManagedClientRequest.php`, logout/session routes, logout contract tests | Add admin UI for post-logout URI management. |
| FR-011 | Kebijakan Scope & Consent per Client | Implemented backend + portal; admin UI missing | Backend + Portal + Admin frontend | `ConsentPage.vue`, `services/consent.api.ts`, `ConnectedAppsPage.vue`, backend consent/scope policy tests | Add admin UI for per-client scope/consent policy. |
| FR-012 | Suspend & Decommission Client | Implemented backend; admin UI missing | Backend + Admin frontend | `ClientLifecycleTokenRevocationContractTest.php`, admin client routes/controllers | Add admin UI for suspend/decommission and token-impact warnings. |
| FR-013 | Login OIDC via Authorization Code + PKCE | Implemented | Backend + Portal | `CreateAuthorizationRedirect.php`, `AuthorizationRequestValidator.php`, portal BFF auth handlers/session tests | Keep no-browser-token regression tests. |
| FR-014 | Login Password Lokal | Implemented | Backend + Portal | `routes/auth.php`, login action/throttle evidence, `LoginPage.vue`, `useLoginForm.ts` | Continue mapping backend errors to safe localized UI copy. |
| FR-015 | Password Policy & Penyimpanan Argon2id | Implemented | Backend + Portal | password policy/lifecycle backend tests, `usePasswordLifecycle.ts`, `ForgotPasswordPage.vue`, `ResetPasswordPage.vue`, `SecurityPasswordForm.vue` | Keep policy hints synchronized with backend policy. |
| FR-016 | Proteksi Brute Force & Rate Limit | Implemented / monitored | Backend + Portal | `LoginAttemptThrottle`, route throttles, login tests, `useLoginForm.ts` structured 429 handling | Add admin UI/reporting for IP allow/block if policy requires. |
| FR-017 | Keamanan Cookie Session | Implemented | Backend + Portal BFF | `SsoSessionCookieFactory`, `services/sso-frontend/src/server/session.ts`, `session-store.ts`, `opaque-session-store.spec.ts`, `callback-session-cookie.spec.ts` | Legacy encrypted-cookie reader should be sunset after migration window. |
| FR-018 | Pendaftaran MFA | Implemented | Backend + Portal + Admin policy | `MfaSettingsPage.vue`, `useMfaEnrollment.ts`, MFA backend contract tests, admin MFA middleware | Admin frontend still needs privileged MFA UX/state handling. |
| FR-019 | Verifikasi MFA saat Login | Implemented / unknown ACR monitored | Backend + Portal | `MfaChallengePage.vue`, `useMfaChallenge.ts`, `LocalLoginAcrEnforcementContractTest.php`, `AcrEvaluator.php` | Decide whether unknown ACR should reject instead of permissive fallback. |
| FR-020 | Recovery Code & Pemulihan MFA | Implemented | Backend + Portal | `RecoveryCodesDisplay.vue`, `RecoveryCodesRegenerateDialog.vue`, `MfaRemoveDialog.vue`, lost-factor/admin reset tests | Add admin frontend flow for support/operator reset if exposed through new admin UI. |
| FR-021 | Step-up Authentication | Needs verification / policy decision | Backend + Portal | `AcrEvaluator.php`, `LocalLoginAcrEnforcementContractTest.php`, `MfaChallengePage.vue` | Unknown `acr_values` are currently permissive; confirm target policy. |
| FR-022 | Lock/Disable Akun & Lifecycle Credential | Backend-only for admin lifecycle; portal UX implemented | Backend + Portal + Admin frontend | `UserController.php`, `UserLifecycleLockController.php`, session lifecycle tests, login safe-copy handling | Add admin UI for lock/unlock/deactivate/reactivate/password reset. |
| FR-023 | Validasi Authorization Request | Implemented | Backend | `AuthorizationRequestValidator.php`, PKCE/state/nonce/redirect tests | Keep current-request source of truth for consent/MFA continuation. |
| FR-024 | Penerbitan Authorization Code | Implemented | Backend | authorization redirect/continuation actions, authorization code exchange tests | Monitor MFA/consent continuation regressions. |
| FR-025 | Enforcement Scope & Claim | Implemented | Backend + Portal | scope policy services, invalid-scope tests, `ConsentPage.vue`, `scope-labels.ts` | Keep portal unknown-scope warnings. |
| FR-026 | Pencatatan & Pencabutan Consent | Implemented | Backend + Portal | consent decision services/tests, `ConnectedAppsPage.vue`, `profile.store` revoke connected app | Add admin audit view for consent revocation events. |
| FR-027 | Penanganan Prompt Login/Consent | Implemented | Backend + Portal | prompt/max-age tests, login/consent pages | Keep prompt behavior covered in OIDC contract tests. |
| FR-028 | Error Response Authorization yang Standar | Implemented | Backend + Portal | `SafeOidcExceptionRenderer.php`, `OidcErrorCatalog.php`, `oauth-error-message.ts` tests | Review stale e2e expectations that may assert raw `error_description`. |
| FR-029 | Exchange Code ke Token | Implemented | Backend + Portal BFF | `TokenController.php`, `ExchangeToken.php`, portal `auth-handlers.ts` | Maintain BFF-only code exchange; no SPA token exchange. |
| FR-030 | ID Token Claims & Signing | Implemented | Backend + Portal BFF | `IssueIdToken`, `UserClaimsFactory`, portal JWKS/auth-callback tests | Keep claim matrix tests updated with new roles/scopes. |
| FR-031 | Profil JWT Access Token | Implemented / monitored | Backend | access token guard/policy tests, token lifecycle tests | Revisit audience policy if multiple resource servers become strict audience consumers. |
| FR-032 | Rotasi Refresh Token | Implemented | Backend + Portal BFF | `RefreshTokenStore.php`, `ExchangeToken.php`, refresh rotation/replay tests | Keep server-side session store TTL/revocation aligned with refresh rotation. |
| FR-033 | Deteksi Penyalahgunaan Refresh Token | Implemented | Backend | refresh reuse audit/notification tests, `RefreshTokenStore.php` | Verify notification channel evidence in staging/production. |
| FR-034 | Endpoint Pencabutan Token | Implemented | Backend + Portal | `routes/oidc.php`, `RevocationController.php`, `RevokeToken.php`, connected-app revocation | Add admin UI visibility for revocation impact. |
| FR-035 | Endpoint UserInfo | Implemented | Backend | `UserInfoController.php`, `BuildUserInfo.php`, userinfo claim tests | Keep scope-to-claim tests. |
| FR-036 | Endpoint Token Introspection | Implemented | Backend + Portal BFF proxy | `routes/oidc.php`, `IntrospectionController.php`, `IntrospectToken.php`, `IntrospectionContractTest.php` | Keep `/introspect` and `/oauth2/introspect` aliases tested. |
| FR-037 | Binding Token ke Session & Client | Implemented / monitored | Backend + Portal BFF | token/session logout fan-out tests, `session-store.ts`, `PortalLogoutFanOutContractTest.php` | Ensure server-side session deletion and backend revocation stay coupled. |
| FR-038 | Kebijakan Masa Berlaku Token | Implemented | Backend + Portal BFF | token lifetime policy tests, `sessionCookieMaxAge`, `session-store.ts` TTL | Keep deploy guard for production lifetime limits. |
| FR-039 | Session SSO & SID | Implemented | Backend + Portal | SSO session lifecycle guard/tests, `SessionRegistrationController.php`, portal session store | Keep SID propagation covered in logout tests. |
| FR-040 | Registry Session Aplikasi Client | Implemented | Backend | `SessionRegistrationController.php`, RP session registry persistence tests | Monitor back-channel dispatch with persistent registry. |
| FR-041 | Logout dari Aplikasi Client | Implemented | Backend + Portal | `SessionLogoutController.php`, `PerformSingleSignOut.php`, logout tests | Maintain RP-initiated logout and id_token_hint binding coverage. |
| FR-042 | Back-channel Logout | Implemented | Backend | `BackChannelLogoutDispatcher.php`, `LocalLogoutTokenVerifier`, replay/partial failure tests | Keep retry/audit behavior tested for partial failures. |
| FR-043 | Front-channel Logout Fallback | Implemented | Backend + Portal proxy | `FrontChannelLogoutFallbackController.php`, frontend proxy route tests | Keep iframe/fallback rendering no-store and safe. |
| FR-044 | Audit & Idempotency Global Logout | Implemented / monitored | Backend + Portal | centralized logout tests, back-channel partial failure tests, session revocation UI | Add admin frontend viewer for logout/audit trail. |
| FR-045 | Lihat Profil User | Implemented | Backend + Portal | `ProfileController.php`, `ProfilePage.vue`, profile tests | Keep minimized profile payload tests. |
| FR-046 | Ubah & Verifikasi Profil | Partial | Backend + Portal + Admin frontend | `ProfilePage.vue`, profile backend tests, admin user update API | Self-service update remains limited; email verification/admin sync UX needs clear ownership. |
| FR-047 | Ganti & Reset Password | Implemented | Backend + Portal | `ChangePasswordController.php`, forgot/reset pages/composables/tests | Keep session/token revocation after password changes. |
| FR-048 | Connected Apps & Active Sessions | Implemented | Backend + Portal | `ConnectedAppsPage.vue`, `SessionsPage.vue`, `ProfileController.php`, revocation tests | Device management beyond sessions remains product backlog if required by UC-70. |
| FR-049 | Workflow Hak Data Pribadi | Implemented / monitored | Backend + Portal + Admin API | `PrivacyPage.vue`, `useDataSubjectRequests.ts`, `DataSubjectFulfillmentService.php`, `QueueDueDataSubjectRequestFulfillmentsCommand.php`, `DataSubjectRequestAutomationContractTest.php` | Add dated compliance evidence packs and admin frontend review UI. |
| FR-050 | Dashboard Admin | Backend-only; admin UI missing | Backend + Admin frontend | `DashboardSummaryController.php`, `AdminDashboardSummaryService`, `services/sso-admin-frontend/src/views/HomeView.vue` readiness shell | Build actual admin dashboard in `sso-admin-frontend`. |
| FR-051 | Manajemen Lifecycle User | Backend-only; admin UI missing | Backend + Admin frontend | `UserController.php`, `UserLifecycleLockController.php`, `UserMfaResetController.php`, backend tests | Build user list/detail/create/update/lock/reset UI. |
| FR-052 | Audit Log, Export & Retention | Backend-only + ops partial; admin UI missing | Backend + Admin frontend + Ops | `AuditTrailController.php`, `AuditTrailExportController.php`, scheduled prune in `routes/console.php`, audit retention evidence tests | Build audit viewer/export UI and verify SIEM sink/signoff. |
| FR-053 | RBAC Admin & Authorization | Partial | Backend + Admin frontend | `routes/admin.php`, `AdminGuard`, `RequireAdminPermission`, `RoleController.php`; admin frontend currently only role `admin` guard | Align admin frontend route/UI authorization with backend permission model or document role-only MVP. |
| FR-054 | Console Kelola Client | Backend-only; admin UI missing | Backend + Admin frontend | `ClientController.php`, `ClientIntegrationController.php`, client CRUD/scope tests | Build client console and secret rotation UI. |
| FR-055 | Kelola Security Policy | Backend-only; admin UI missing | Backend + Admin frontend | `SecurityPolicyController.php`, security policy tests | Build policy version/read/write/activate/rollback UI with step-up confirmation. |
| FR-056 | Monitoring Health & Incident Action | Partial / operational evidence missing | Backend + Ops + Admin frontend | `EnsureInternalMetricsToken`, `/ready`, internal metrics routes, observability dashboards/runbooks | Add admin/ops UI or runbook linkage, IP allow/block management, dated DR/failover evidence. |
| FR-057 | Konfigurasi Discovery IdP Eksternal | Backend-only; admin UI missing | Backend + Admin frontend | external IdP routes/controllers/services/tests | Build external IdP provider management UI. |
| FR-058 | Mapping Login Federasi | Implemented backend; admin UI missing | Backend + Admin frontend | external IdP mapping services/tests, mapping preview route/controller | Add mapping preview/config UI. |
| FR-059 | Failover & Disable Federasi | Implemented backend/ops; admin UI missing | Backend + Ops + Admin frontend | external IdP circuit breaker tests, health probe schedule | Add admin UI visibility for provider health/disable/failover state. |
| FR-060 | Taksonomi Error OAuth/OIDC | Implemented / unknown ACR policy monitored | Backend + Portal | `OidcErrorCatalog.php`, `SafeOidcExceptionRenderer.php`, `oauth-error-message.ts` | Decide whether unknown ACR permissive fallback needs strict OAuth/OIDC error. |
| FR-061 | UX Error untuk User & Lokalisasi | Implemented / monitored | Portal + Backend | `safe-error-presenter.ts`, `api-error.ts`, `id.json`, auth/consent/session UI tests | Review e2e stale raw-error expectations. |
| FR-062 | Pesan Error Aman | Implemented | Backend + Portal | `SafeOidcErrorDescription.php`, safe error tests, portal safe-copy mappings | Keep raw technical errors out of UI/log-facing responses. |
| FR-063 | Diagnostik Developer & Correlation ID | Implemented / ops monitored | Backend + Portal + Ops | request/error ref propagation tests, `apiClient` request IDs, runbooks | Ensure admin audit/incident UI exposes correlation ID/SID search. |

## 4. UC Coverage Matrix

| UC Range | Coverage status | Notes |
| --- | --- | --- |
| UC-01–UC-09 Discovery & Client Configuration | Partial | Discovery/JWKS/client backend is strong. Admin client-management UI for UC-03–UC-07/UC-09 is still missing in `sso-admin-frontend`. |
| UC-10–UC-21 Authentication & Authorization | Implemented / monitored | Login, PKCE, consent, prompt, MFA, and step-up are implemented. Unknown ACR fallback remains a product/security policy decision. |
| UC-22–UC-33 Token Lifecycle | Implemented | Token exchange, ID/access token, refresh rotation/reuse, revocation, userinfo, introspection, binding, and lifetimes are covered by backend/BFF evidence. |
| UC-34–UC-42 Profile & Self-Service | Implemented / monitored | Profile/password/sessions/connected apps/DSR are implemented. DSR compliance evidence packs and admin review UI remain follow-up. |
| UC-43–UC-50 Session & Logout | Implemented / monitored | SSO sessions, RP session registry, RP logout, back/front-channel fallback, idempotency, session expiry, and admin session termination backend exist. Admin UI missing for UC-50. |
| UC-51–UC-65 Admin Management | High gap | Backend APIs/RBAC/audit/policy/client/user endpoints exist, but `sso-admin-frontend` lacks the actual admin dashboard, user, role, audit, client, policy, incident, and compliance evidence pack screens. |
| UC-66–UC-76 Security & Risk | Partial | MFA enrollment/challenge/recovery and admin MFA middleware exist. Device management, IP allow/blocklist management, security notification operational evidence, suspicious-login challenge breadth, and emergency reset UI require follow-up. |
| UC-77–UC-83 Integration & Operations | Partial / evidence missing | Monitoring/runbooks/workflows exist. Need completed restore drill, SIEM sink verification, JWKS staging/prod rotation signoff, incident drill evidence, and DR/failover drill evidence. |

## 5. Confirmed Gap Register

### GAP-001 — Admin frontend governance UI is still readiness-only

- **Severity:** High
- **FR/UC:** FR-050–FR-055, FR-057–FR-059 / UC-51–UC-65, UC-81–UC-82
- **Services:** `services/sso-admin-frontend`, `services/sso-backend`
- **Evidence:**
  - `services/sso-admin-frontend/src/router/index.ts` exposes only `/` and `/forbidden`.
  - `services/sso-admin-frontend/src/views/HomeView.vue` is a readiness/migration shell.
  - `services/sso-admin-frontend/src` contains auth/session guard files and readiness components, but no dashboard/users/clients/audit/policy/federation feature modules.
  - Backend APIs exist in `services/sso-backend/routes/admin.php` for dashboard, users, sessions, clients, roles, policies, audit, DSR, SSO error templates, and external IdPs.
- **Impact:** Admin/governance requirements are backend-ready but not usable through the new admin frontend.
- **Recommendation:** Build `sso-admin-frontend` in slices: shell/navigation + permission-aware principal, dashboard summary, user lifecycle, audit/export, client management, role/RBAC, security policies, external IdPs, then ops/incident surfaces.
- **Suggested priority:** P0/P1.

### GAP-002 — Admin frontend authorization is role-only while backend is permission-based

- **Severity:** Medium/High
- **FR/UC:** FR-053 / UC-51, UC-52, UC-56, UC-57, UC-73
- **Services:** `services/sso-admin-frontend`, `services/sso-backend`
- **Evidence:**
  - `services/sso-admin-frontend/src/lib/auth/adminAccess.ts` allows `roles.includes('admin')`.
  - `services/sso-admin-frontend/src/router/guards.ts` blocks non-admin and redirects unauthenticated users to portal login.
  - `services/sso-backend/routes/admin.php` uses `RequireAdminPermission` for fine-grained capabilities.
- **Impact:** Role-only frontend gate is acceptable for the current shell, but insufficient once feature screens expose privileged actions. Backend remains the security boundary, but UI should not show controls a principal cannot use.
- **Recommendation:** Keep role-only guard for bootstrap, then add `/admin/api/me` principal/permissions bootstrap and permission-aware route meta/action hiding before implementing sensitive admin pages.
- **Suggested priority:** P1 before broad admin UI.

### GAP-003 — Unknown `acr_values` are intentionally permissive

- **Severity:** Needs decision; High if strict step-up is required
- **FR/UC:** FR-021, FR-060 / UC-19, UC-67, UC-68, UC-72
- **Services:** `services/sso-backend`
- **Evidence:**
  - `services/sso-backend/app/Services/Oidc/AcrEvaluator.php` returns true when requested ACR level is unknown.
  - `services/sso-backend/tests/Unit/Services/Oidc/AcrEvaluatorTest.php` and `tests/Feature/Oidc/LocalLoginAcrEnforcementContractTest.php` lock this permissive behavior.
- **Impact:** RPs requesting unsupported assurance values may receive a password-level flow instead of a standards-style rejection/step-up error. This may be acceptable as a compatibility policy, but it should be explicit.
- **Recommendation:** Decide policy. If strict, change unknown ACR to fail with safe OIDC error and add regression tests. If permissive, document it in protocol policy and discovery/support docs.
- **Suggested priority:** P1 policy decision.

### GAP-004 — Operational evidence is not fully audit-closed

- **Severity:** Medium/High
- **FR/UC:** FR-002, FR-003, FR-052, FR-056, FR-063 / UC-77–UC-83
- **Services:** Ops/docs/backend
- **Evidence:**
  - Backup/restore templates and scripts exist: `docs/runbooks/backup-drill-evidence-pack.md`, `infra/backup/create-control-plane-backup.sh`, `infra/backup/run-restore-drill.sh`, `.github/workflows/backup-restore-drill.yml`.
  - JWKS rotation evidence exists as runbooks/workflows/scripts: `docs/security/jwks-caching-rotation-runbook.md`, `.github/workflows/jwks-rotation-simulation.yml`, `infra/qa/run-jwks-rotation-staging-drill.sh`.
  - Monitoring/runbook assets exist under `docs/runbooks` and `infra/observability`.
  - SIEM sink verification and dated DR/failover signoff were not verified in-repo.
- **Impact:** Operational readiness exists as automation/runbook scaffolding, but compliance closure needs executed evidence artifacts and operator signoff.
- **Recommendation:** Store dated evidence packs for restore drill, SIEM export sink verification, JWKS staging/prod drill, incident runbook exercise, and DR failover drill.
- **Suggested priority:** P1 for production audit readiness.

### GAP-005 — IP allowlist/blocklist management is not a first-class control surface

- **Severity:** Medium
- **FR/UC:** FR-016, FR-056 / UC-75
- **Services:** `services/sso-backend`, ops/admin frontend
- **Evidence:** Backend throttles and internal metrics token guard exist, but no verified admin/operator UI or workflow for abuse IP allow/blocklist management was found.
- **Impact:** Abuse response may rely on infrastructure/manual controls rather than auditable SSO control-plane workflow.
- **Recommendation:** Define ownership: infra-only runbook vs backend policy model vs admin UI. If in-product, add backend model/API, audit events, and admin frontend UI.
- **Suggested priority:** P2 unless active abuse response requires it sooner.

### GAP-006 — Security notification and suspicious-login breadth need evidence

- **Severity:** Medium
- **FR/UC:** FR-020, FR-021, FR-033, FR-047 / UC-68, UC-71, UC-72, UC-76
- **Services:** `services/sso-backend`, `services/sso-frontend`
- **Evidence:** Refresh-token reuse notification evidence exists, MFA/password flows exist, but end-to-end evidence for all expected security notifications and suspicious-login challenge variants was not verified.
- **Impact:** Users/admins may not receive consistent alerts for credential reset, MFA changes, suspicious login, and emergency reset events.
- **Recommendation:** Create notification matrix and tests for password reset, password change, MFA enroll/remove/regenerate, refresh reuse, suspicious login, and emergency reset.
- **Suggested priority:** P2.

### GAP-007 — Legacy portal session cookie fallback should be sunset

- **Severity:** Low/Medium
- **FR/UC:** FR-017, FR-037, FR-063 / UC-43, UC-49
- **Services:** `services/sso-frontend`
- **Evidence:**
  - `services/sso-frontend/src/server/session.ts` uses the new opaque `__Host-sso-portal-session` handle and server-side session record.
  - `services/sso-frontend/src/server/session-store.ts` persists server-side sessions and fails closed in production without Redis.
  - `readLegacySession()` still accepts `SSO_PORTAL_LEGACY_SESSION_COOKIE` encrypted token bundle if present.
  - `opaque-session-store.spec.ts` asserts legacy cookies are ignored by default in the tested invalid case, but runtime fallback code remains.
- **Impact:** Current cookie posture is materially improved, but legacy fallback increases complexity and should have a removal window.
- **Recommendation:** Add a dated migration/removal task for `SSO_PORTAL_LEGACY_SESSION_COOKIE` fallback after production confirms no legacy sessions remain.
- **Suggested priority:** P3 unless migration window is over.

### GAP-008 — Existing audit docs and env names contain stale admin naming

- **Severity:** Low
- **FR/UC:** FR-050–FR-056 / UC-51–UC-65
- **Services:** docs/devops/admin frontend
- **Evidence:** Older audit text referenced the deprecated admin Vue service name; current target is `services/sso-admin-frontend`. Env variable `SSO_ADMIN_VUE_BASE_PATH` intentionally remains stable for this release.
- **Impact:** Readers may confuse current service name with historical canary name.
- **Recommendation:** Update docs opportunistically to use `services/sso-admin-frontend` while keeping `SSO_ADMIN_VUE_BASE_PATH` documented as legacy/stable env name until separately renamed.
- **Suggested priority:** P3.

## 6. False-Positive Exclusions / Resolved Historical Concerns

1. **Browser OAuth token exposure is no longer a live finding for the portal.** `services/sso-frontend/src/server/session.ts` now sets an opaque session handle, while `session-store.ts` stores token-bearing `PortalSession` server-side. `callback-session-cookie.spec.ts` verifies tokens are not embedded in the browser cookie.
2. **DSR delete/anonymize is no longer only a summary payload.** `DataSubjectFulfillmentService.php`, `QueueDueDataSubjectRequestFulfillmentsCommand.php`, `routes/console.php`, and `DataSubjectRequestAutomationContractTest.php` show approved DSR automation, delete/anonymize effects, and scheduled queueing.
3. **Consent is not display-only in current portal evidence.** `ConsentPage.vue` has enabled deny/allow decisions through `submitConsentDecision()`, and connected-app revocation exists in `ConnectedAppsPage.vue`.
4. **MFA portal UI is active.** `MfaSettingsPage.vue`, `useMfaEnrollment.ts`, challenge/recovery components, and backend contract tests cover enrollment/challenge/recovery surfaces.
5. **Introspection and front-channel fallback exist.** `routes/oidc.php` exposes `/introspect`, `/oauth2/introspect`, and `/connect/logout/frontchannel`; backend/frontend proxy tests should keep them locked.

## 7. Recommended Remediation Roadmap

### P0 — Admin frontend foundation

1. Add admin app shell/navigation, `/admin/api/me` bootstrap, and permission-aware route metadata.
2. Build dashboard summary page using `DashboardSummaryController`.
3. Add test-backed role/permission hiding and forbidden/unauthenticated flows.

### P1 — Governance feature parity

1. User lifecycle UI: create/update/lock/unlock/deactivate/reactivate/password-reset/MFA reset.
2. Client management UI: client list/detail, redirect/logout URI editing, scope policy, secret rotation, suspend/decommission.
3. Audit UI: event list/detail, integrity status, export, correlation ID/SID search.
4. Security policy UI: version create/review/activate/rollback with step-up confirmation.
5. External IdP UI: provider config, mapping preview, health/failover state.

### P1 — Operational audit closure

1. Attach completed backup/restore evidence pack with manifest/comparison/reconciliation artifacts.
2. Verify SIEM export sink and store operator signoff.
3. Run and store JWKS staging/prod rotation drill evidence.
4. Run incident runbook and DR/failover drill, then link evidence to FR-056/UC-82/UC-83.

### P1 policy decision

1. Decide unknown `acr_values` policy.
2. If strict: reject unsupported ACR with safe OAuth/OIDC error and update tests.
3. If permissive: document as compatibility behavior and mark FR-021 as accepted policy.

### P2/P3 hardening

1. Define IP allow/blocklist ownership and audit trail.
2. Expand security notification matrix.
3. Sunset legacy portal session cookie fallback after migration window.
4. Normalize stale admin frontend service-name docs references while preserving stable env names where intentional.

## 8. Verification Checklist for This Audit

- FR-001 through FR-063 are represented in the coverage matrix.
- UC-01 through UC-83 are represented by range in the UC matrix.
- Current admin service name is `services/sso-admin-frontend`.
- Historical deprecated admin Vue service references are treated as stale unless explicitly discussing previous audit context.
- Findings distinguish backend/API implementation from admin frontend UI delivery.
- Operational items distinguish scripts/runbooks from completed evidence/signoff.
- Historical findings are not repeated if current evidence shows they were closed.
