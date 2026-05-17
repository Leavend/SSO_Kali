# UAT Audit — FR/UC SSO Practical Reader vs Codebase

**Tanggal:** 2026-05-17
**Branch:** `hardening/sso-bff-dsr-automation`
**Baseline commit:** `93db868`
**Requirement source:** `docs/requirements/fr_uc_sso_practical_reader.md`
**Implementation scope:** `services/sso-frontend`, `services/sso-backend`
**Companion audit:** `docs/audits/fr-001-fr-063-gap-audit.md`
**Execution template:** `docs/audits/fr-uc-sso-uat-runbook-template.md`

## 1. Executive Summary

Audit ini mengubah FR/UC reader-friendly menjadi **UAT-ready evidence map**: apa yang bisa diuji user/stakeholder, entrypoint yang harus dipakai, expected result, evidence code/test, dan status readiness.

Kesimpulan:

1. **Portal SSO user UAT siap diuji end-to-end** untuk login, callback, session, profile, password, MFA, connected apps, active sessions, consent, logout, safe error UX, dan DSR intake.
2. **Backend protocol UAT/API contract kuat** untuk OIDC discovery/JWKS/authorize/token/userinfo/introspection/revocation/session/logout/key rotation.
3. **Admin/governance backend siap diuji via API**, tetapi **browser admin UI bukan scope `services/sso-frontend`**. UAT klik-path admin perlu dedicated admin app (`services/sso-admin-vue`/successor), bukan re-add admin route ke portal.
4. **Known UAT gaps**: DSR delete/anonymize full automation, opaque server-side BFF token session, full admin UI, broader device inventory, SIEM/export ops signoff, DR/failover drill evidence.
5. **Recent prod risk fixed:** BFF now preserves every upstream `Set-Cookie` via `services/sso-frontend/src/server/proxy-headers.ts`; UAT login must verify all auth cookies survive proxy.

## 2. UAT Principles Used

| Principle | Audit rule |
| --- | --- |
| Traceability | Every UAT scenario maps to UC/FR from `fr_uc_sso_practical_reader.md`. |
| Black-box first | Prefer browser/API behavior over implementation claims. |
| Evidence-backed | Code path + contract test/smoke script listed for each domain. |
| No admin scope drift | `services/sso-frontend` remains portal-only; admin UI belongs elsewhere. |
| Security-safe UAT | Do not expose tokens/secrets in browser storage, logs, screenshots, or UAT artifacts. |
| Reproducible signoff | UAT steps specify preconditions, action, expected result, evidence to retain. |

## 3. UAT Environment & Preconditions

### 3.1 Recommended Environments

| Env | Purpose | URL / entrypoint |
| --- | --- | --- |
| Production-like portal | User portal UAT | `https://sso.timeh.my.id` |
| Backend API | Protocol/API UAT | backend routes behind same origin/BFF or direct internal API per deployment |
| CI evidence | Regression evidence | GitHub Actions build/test/deploy logs |

### 3.2 Test Data Needed

| Persona | Required state |
| --- | --- |
| Normal user | active account, verified email, password known, no MFA initially |
| MFA user | active account, TOTP enrolled, recovery codes available |
| Locked/disabled user | locked or deactivated account |
| Password-expired user | `password_changed_at` old / forced reset state |
| Admin | backend admin principal with RBAC permissions + MFA enrolled |
| Confidential client | client secret active, redirect URI registered |
| Public client | PKCE required, no client secret |
| External IdP pilot | provider config + callback route enabled if testing federation |
| DSR subject | user with profile/audit/session data |

### 3.3 Evidence to Retain

- Browser HAR with cookies redacted.
- Screenshots of success/error states without tokens/secrets.
- API request/response samples with Authorization/Cookie redacted.
- `X-Request-ID` / `X-Error-Ref` for failures.
- CI run link + commit SHA.
- Backend logs filtered by request ID.

## 4. Scope Boundary

| Area | UAT owner | Status |
| --- | --- | --- |
| User portal browser flows | `services/sso-frontend` + BFF + backend | In scope |
| OIDC/OAuth protocol | `services/sso-backend` + BFF proxy | In scope |
| Profile/self-service | frontend portal + backend | In scope |
| Admin APIs | backend | In scope via API |
| Admin browser UI | **not** `services/sso-frontend` | Out of scope / dedicated admin app |
| DevOps drill | workflows/scripts | Evidence-only unless operator UAT scheduled |

## 5. High-Priority UAT Smoke Pack

Run these before broad UAT.

| Smoke | UC/FR | Steps | Expected |
| --- | --- | --- | --- |
| Login cookie survival | UC-11, UC-43 / FR-017, FR-039 | Login at portal; inspect response cookies | `__Host-sso_session`, `__Host-laravel_session`, `XSRF-TOKEN` present; post-login APIs return 200 |
| Session hydration | UC-34, UC-40 | Reload `/home`, then `/profile`, `/sessions`, `/apps` | no 401 loop; profile/sessions/apps data visible |
| OIDC metadata | UC-01, UC-02 | GET discovery + JWKS | 200, cache headers, issuer/endpoints consistent |
| OIDC auth code + PKCE | UC-10, UC-17, UC-22 | start RP auth flow with PKCE | code issued, token exchange succeeds, invalid PKCE rejected |
| Safe error UX | UC-16, UC-17, UC-30, UC-63 | invalid redirect/PKCE/client secret | safe localized error, no trace/secret, request/error ref available |
| MFA core | UC-66, UC-67, UC-69 | enroll TOTP, login challenge, regenerate recovery codes | challenge required, AMR persisted, recovery lifecycle works |
| Connected apps revoke | UC-38, UC-39 | open `/apps`, revoke app | consent/tokens/sessions revoked; UX safe on partial failure |
| Active sessions revoke | UC-40, UC-49 | open `/sessions`, revoke one/all | target sessions closed; current session protected/handled |
| DSR intake | UC-41, UC-42 | open `/privacy`, submit export/delete request | request listed with status; no-store response |
| Logout fan-out | UC-45, UC-46, UC-48 | logout portal/RP | local cookie cleared; RP/backchannel/frontchannel paths attempted/idempotent |

## 6. Domain UAT Readiness

| Domain | UC range | Readiness | Notes |
| --- | --- | --- | --- |
| Discovery & Client Config | UC-01–UC-09 | **Partial** | Metadata/JWKS strong. Client mgmt backend ready; admin UI click-path pending. |
| Auth & Authorization | UC-10–UC-21 | **Ready** | Portal+BFF+backend flows covered; verify prod cookie forwarding after recent fix. |
| Token Lifecycle | UC-22–UC-33 | **Ready** | Token/introspection/revocation/rotation implemented; UAT mostly API/protocol. |
| Profile & Self-Service | UC-34–UC-42 | **Partial/Ready** | Profile/password/apps/sessions ready. DSR intake ready; full delete/anonymize automation partial. |
| Session & Logout | UC-43–UC-50 | **Partial/Ready** | User logout/session ready. Admin terminate via backend API; admin UI pending. |
| Admin Management | UC-51–UC-65 | **Backend Ready / UI Gap** | API/RBAC/audit/security policy present; browser admin UI out of portal scope. |
| Security & Risk | UC-66–UC-76 | **Partial/Ready** | MFA/recovery/throttle/emergency reset ready; risk/device/IP controls partial/phase-driven. |
| Integration & Ops | UC-77–UC-83 | **Partial** | Health/smoke/key rotation evidence exists; backup/DR/SIEM require operator drill signoff. |

## 7. Detailed UC → UAT Traceability Matrix

Legend: **Ready** = UAT executable now; **Partial** = executable with limitation; **Gap** = not ready; **API-only** = no browser UI in current scope; **Phase** = intentionally later phase.

### 7.1 Discovery & Client Configuration

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-01 Lihat OIDC Discovery | RP fetches metadata | `GET /.well-known/openid-configuration` | Ready | `services/sso-backend/routes/oidc.php`, `DiscoveryController`, `DiscoveryDocumentTest.php` |
| UC-02 Lihat JWKS | RP fetches signing keys | `GET /.well-known/jwks.json`, `/jwks` | Ready | `JwksController`, `SigningKeyService`, `JwtValidationClaimContractTest.php` |
| UC-03 Kelola Client Baru | Admin creates client | `/admin/api/clients` | API-only | `ClientController`, `AdminClientIntegrationContractTest.php`, `ClientManagementCrudBackendTest.php` |
| UC-04 Kelola Redirect/Logout URI | Admin updates URIs; invalid exact-match rejected | `/admin/api/clients/{clientId}` | API-only | `RedirectUriExactMatchTest.php`, `LogoutUriRejectionContractTest.php` |
| UC-05 Kelola Client Secret | Rotate secret; plaintext shown once | `/admin/api/clients/{clientId}/rotate-secret` | API-only | `RotateClientSecretAction.php`, `ClientSecretLifecycleContractTest.php` |
| UC-06 Suspend Client | Disable client and revoke tokens | `/admin/api/client-integrations/{clientId}/disable` | API-only | `ClientLifecycleTokenRevocationContractTest.php` |
| UC-07 Kelola Scope/Consent Client | Admin sync scopes; auth enforces allowed scope | `/admin/api/clients/{clientId}/scopes` | API-only | `ScopePolicy`, `ConsentFlowContractTest.php`, `RefreshTokenDownscopeContractTest.php` |
| UC-08 Validasi Issuer/Metadata | RP verifies issuer/endpoints | discovery document + FE metadata warmer | Ready | `OidcCatalog`, `canonicalization.ts`, `warmer.ts` |
| UC-09 Decommission Client | Admin deletes/decommissions client | `DELETE /admin/api/clients/{clientId}` | API-only | `ClientIntegrationRegistrationService`, `ClientLifecycleTokenRevocationContractTest.php` |

### 7.2 Authentication & Authorization

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-10 Start Authorization Request | RP starts auth code + PKCE | `/authorize`, `/oauth2/authorize` | Ready | `AuthorizeController`, `CreateAuthorizationRedirect`, `AuthorizationCodeFlowE2EContractTest.php` |
| UC-11 Login via Portal SSO | User logs in via portal | `/`, `/api/auth/login`, `/connect/local-login` | Ready | `LoginPage.vue`, `useLoginForm.ts`, `LoginController.php`, `LocalLoginContractTest.php` |
| UC-12 Resume Authorization | User login resumes pending auth | callback/authorize session | Ready | `CompletePendingOidcAuthorization.php`, `AuthorizationCodeStore.php` |
| UC-13 Consent | User allows scopes | `/auth/consent`, `/connect/consent` | Ready | `ConsentPage.vue`, `consent.api.ts`, `ConsentFlowContractTest.php` |
| UC-14 Force Re-auth | `prompt=login` forces login | router + authorize | Ready | `router/index.ts`, `MaxAgeEnforcementContractTest.php` |
| UC-15 Silent Auth | `prompt=none` returns login_required if no session | `/authorize?prompt=none` | Ready | `PromptNoneSemanticsContractTest.php` |
| UC-16 Invalid Redirect URI | RP invalid redirect rejected safely | `/authorize` | Ready | `AuthorizeRedirectUriRejectionContractTest.php` |
| UC-17 Invalid PKCE/State/Nonce | bad verifier/state/nonce rejected | token/callback | Ready | `pkce.ts`, `TokenEndpointHardeningContractTest.php`, `auth-callback-jwks.spec.ts` |
| UC-18 Locked Account Login | locked/disabled user cannot login | `/api/auth/login` | Ready | `VerifyLocalPasswordLoginAction.php`, `SsoSessionLifecycleGuardContractTest.php` |
| UC-19 Step-up Auth | high assurance request triggers MFA/reauth | `acr_values`, `max_age` | Ready | `AcrEvaluator`, `StepUpAuthenticationTest.php`, `LocalLoginAcrEnforcementContractTest.php` |
| UC-20 Password Expired | expired password forces reset/change | login + reset/change pages | Ready | `passwordLifecycle.shared.ts`, `LocalLoginContractTest.php`, `use-password-lifecycle.contract.test.ts` |
| UC-21 Deny Consent | user denies consent, RP gets safe error | `/auth/consent` | Ready | `ConsentPage.vue`, `OidcErrorShapeConsistencyContractTest.php` |

### 7.3 Token Lifecycle

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-22 Exchange Code | client exchanges code | `POST /token`, `/oauth2/token` | Ready | `TokenController`, `ExchangeToken`, `AuthorizationCodeExchangeEdgeContractTest.php` |
| UC-23 Validate ID Token | RP validates signed ID token | JWKS + token response | Ready | `IssueIdToken`, `IdTokenClaimsMatrixContractTest.php` |
| UC-24 UserInfo | client calls UserInfo | `/userinfo` | Ready | `UserInfoController`, `BuildUserInfo`, `UserInfoEndpointClaimsContractTest.php` |
| UC-25 Refresh Rotation | refresh token rotates | `grant_type=refresh_token` | Ready | `RefreshTokenStore`, `AtomicRefreshRotationContractTest.php` |
| UC-26 Refresh Reuse Detection | replay old refresh token | token endpoint | Ready | `RefreshTokenReuseAuditContractTest.php`, `RefreshTokenReuseDetectedNotification.php` |
| UC-27 Revoke Token | client/user revokes token | `/revocation`, `/oauth/revoke` | Ready | `RevocationController`, `RevocationEndpointRfc7009ContractTest.php` |
| UC-28 Introspection | resource server introspects token | `/introspect`, `/oauth2/introspect` | Ready | `IntrospectionController`, `IntrospectionContractTest.php`, `proxy-routes.spec.ts` |
| UC-29 Expired/Unknown Token | invalid bearer gets standard error | `/userinfo`, `/introspect` | Ready | `AccessTokenGuard`, `SafeErrorDescriptionContractTest.php` |
| UC-30 Client Auth Failure | bad client secret rejected safely | `/token` | Ready | `TokenClientAuthenticationResolver`, `TokenEndpointHardeningContractTest.php` |
| UC-31 Key Rotation Validation | rotate JWKS; old/new validation | `sso:rotate-signing-keys`, JWKS | Ready | `RotateSigningKeysCommand.php`, `jwks-rotation-simulation.yml` |
| UC-32 Wrong Audience | token audience mismatch rejected | resource endpoint | Ready | `AccessTokenAudiencePolicyContractTest.php` |
| UC-33 Token Lifetime | access/refresh TTL follows policy | token issuance + config check | Ready | `TokenLifetimePolicyContractTest.php`, `CheckTokenLifetimePolicyCommand.php` |

### 7.4 Profile & User Self-Service

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-34 Lihat Profil | user opens profile | `/profile`, `GET /api/profile` | Ready | `ProfilePage.vue`, `ProfilePortalBackendContractTest.php` |
| UC-35 Ubah Profil | user updates allowed fields | `PATCH /api/profile` | Ready | `UpdateProfilePortalAction.php`, `ProfilePortalDataQualityContractTest.php` |
| UC-36 Ganti Password | user changes password | `/security`, `POST /api/profile/change-password` | Ready | `SecurityPage.vue`, `ChangePasswordContractTest.php` |
| UC-37 Reset Password | forgot/reset password flow | `/auth/forgot-password`, `/auth/reset-password` | Ready | `PasswordResetLifecycleContractTest.php` |
| UC-38 Lihat Connected Apps | user opens apps | `/apps`, `GET /api/profile/connected-apps` | Ready | `ConnectedAppsPage.vue`, `ConnectedAppsPaginationContractTest.php` |
| UC-39 Cabut Consent Aplikasi | user revokes connected app | `DELETE /api/profile/connected-apps/{clientId}` | Ready | `RevokeConnectedAppAction.php`, `ConnectedAppsSelfServiceRevocationContractTest.php` |
| UC-40 Lihat/Tutup Active Sessions | user views/revokes sessions | `/sessions`, `/api/profile/sessions` | Ready | `SessionsPage.vue`, `UserSessionsSelfServiceContractTest.php` |
| UC-41 Request Export Data | user submits DSR export | `/privacy`, `/api/profile/data-subject-requests` | Partial | `PrivacyPage.vue`, `DataSubjectRequestSelfServiceContractTest.php`; full fulfillment evidence needs admin/operator flow |
| UC-42 Request Delete/Anonim | user submits DSR delete/anonymize | `/privacy`, DSR API | Partial | intake/list ready; queued delete/anonymize automation pending |

### 7.5 Session & Logout

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-43 Create SSO Session/SID | login creates SSO session cookie/SID | `/api/auth/login`, `/api/auth/session` | Ready | `SsoSessionService.php`, `SsoSessionCookieFactory.php`, `ProfilePortalSessionCookieContractTest.php` |
| UC-44 Register RP Session | RP registers session | `/connect/register-session` | Ready | `SessionRegistrationController`, `RpSessionRegistryPersistenceContractTest.php` |
| UC-45 RP-Initiated Logout | RP starts logout | `/connect/logout` | Ready | `SessionLogoutController`, `IdTokenHintSidBindingContractTest.php` |
| UC-46 Back-channel Logout | backend notifies all clients | backchannel dispatch/job | Ready | `BackChannelLogoutDispatcher.php`, `BackChannelLogoutAcceptanceTest.php` |
| UC-47 Front-channel Fallback | browser iframe fallback | `/connect/logout/frontchannel` | Ready | `FrontChannelLogoutFallbackController.php`, `FrontChannelLogoutFallbackContractTest.php` |
| UC-48 Idempotent/Race Logout | repeat logout safe | logout endpoints | Ready | `CentralizedLogoutTest.php`, `BackChannelLogoutPartialFailureContractTest.php` |
| UC-49 Expiry/Idle Timeout | idle/expired session rejected | session heartbeat/API | Ready | `useSessionHeartbeat.ts`, `SessionIdleTimeoutContractTest.php` |
| UC-50 Admin Terminate Session | admin closes user session | `/admin/api/sessions/*` | API-only | `Admin\SessionController.php`, `AdminSessionManagementRbacTest.php`; admin UI pending |

### 7.6 Admin Management

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-51 Admin Login | admin session + MFA gate | `/admin/api/me` | API-only | `AdminGuard`, `EnsureAdminMfaEnrolled`, `AdminMfaEnforcementTest.php` |
| UC-52 Dashboard | admin views summary | `/admin/api/dashboard/summary` | API-only | `DashboardSummaryController`, `AdminGovernanceContractTest.php` |
| UC-53 Create User | admin creates user | `POST /admin/api/users` | API-only | `CreateManagedUserAction.php`, `UserManagementBackendTest.php` |
| UC-54 Update User | admin syncs/updates user profile | `/admin/api/users/{subjectId}` + sync-profile | API-only | `AdminUserPresenter`, `UserManagementBackendTest.php` |
| UC-55 Lock/Unlock User | admin locks/unlocks | `/admin/api/users/{subjectId}/lock|unlock` | API-only | `UserLifecycleLockController.php`, `AdminGovernanceContractTest.php` |
| UC-56 Assign Role | admin assigns role | `PUT /admin/api/users/{subjectId}/roles` | API-only | `RoleController`, `RolePermissionManagementBackendTest.php` |
| UC-57 Review RBAC Matrix | security reviews permissions | `/admin/api/roles`, `/permissions` | API-only | `AdminPermissionMatrix`, `AdminPermissionMatrixMenuContractTest.php` |
| UC-58 View Audit Log | admin views audit | `/admin/api/audit/events` | API-only | `AuditTrailController`, `AdminAuditTrailContractTest.php` |
| UC-59 Export Audit Log | admin exports audit | `/admin/api/audit/export` | API-only | `AuditTrailExportController`, `ExportAdminAuditEventsAction.php` |
| UC-60 Configure Client | admin views/updates clients | `/admin/api/clients` | API-only | `ClientController`, `ClientManagementCrudBackendTest.php` |
| UC-61 Rotate Secret | admin rotates secret | `/admin/api/clients/{clientId}/rotate-secret` | API-only | `RotateClientSecretActionTest.php` |
| UC-62 Security Policy | admin versions policies | `/admin/api/security-policies/{category}` | API-only | `SecurityPolicyController`, `SecurityPolicyAndFederationContractTest.php` |
| UC-63 Incident Investigation | request/error ref lookup | audit + error refs | Partial | `ErrorRefPropagationContractTest.php`, `RequestLifecycleObservabilityTest.php`; runbook signoff pending |
| UC-64 Key Rotation | operator rotates keys | artisan/workflow | Ready | `RotateSigningKeysCommand.php`, `jwks-rotation-simulation.yml` |
| UC-65 Compliance Evidence Pack | DSR/audit/export evidence | admin APIs + generated artifacts | Partial | DSR/audit backend ready; packaged evidence workflow requires ops definition |

### 7.7 Security & Risk

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-66 Enroll MFA | user/admin enrolls TOTP | `/security/mfa`, `/api/mfa/totp/enroll` | Ready | `MfaSettingsPage.vue`, `TotpEnrollmentContractTest.php` |
| UC-67 Verify MFA Login | login requires challenge | `/auth/mfa-challenge`, `/api/mfa/challenge/verify` | Ready | `MfaChallengePage.vue`, `MfaChallengeContractTest.php` |
| UC-68 Risk Score | suspicious login evaluated | login risk service | Partial/Phase | `LoginRiskEvaluator.php`, `SuspiciousLoginPolicy.php`; UAT scenario needs policy fixtures |
| UC-69 MFA Recovery | recovery codes/regenerate | `/security/mfa` | Ready | `RecoveryCodeRegenerationTest.php`, `LostFactorRecoveryWorkflowContractTest.php` |
| UC-70 Manage Device | device/session management | `/sessions` | Partial | active sessions ready; broader device inventory/policy pending |
| UC-71 Security Notification | notification sent for security events | mail/notification channels | Partial | MFA/recovery/reuse notifications exist; broader event coverage needs UAT matrix |
| UC-72 Suspicious Login Challenge | high risk triggers challenge | login + risk policy | Partial/Phase | risk evaluator exists; end-user challenge policy needs acceptance fixtures |
| UC-73 Mandatory Admin MFA | admin without MFA blocked | `/admin/api/*` | API-only Ready | `EnsureAdminMfaEnrolled.php`, `AdminMfaEnforcementTest.php` |
| UC-74 Rate Limit/Throttle | repeated attempts get 429/safe UX | login/token/profile/admin APIs | Ready | `LoginAttemptThrottleTest.php`, route throttle middleware |
| UC-75 IP Blocklist/Allowlist | abuse IP policy controls | security policy/ops | Partial/Phase | `SecurityPolicyService.php`; explicit network enforcement drill pending |
| UC-76 Emergency Credential Reset | admin resets MFA/password/tokens | admin API | API-only Ready | `EmergencyMfaResetAction.php`, `EmergencyMfaResetTest.php` |

### 7.8 Integration & Operations

| UC | UAT scenario | Entrypoint | Status | Evidence |
| --- | --- | --- | --- | --- |
| UC-77 Monitor OIDC SLI | health/readiness/metadata checks | `/health`, `/ready`, discovery/JWKS | Ready | `ReadinessController`, `ReadinessObservabilityTest.php`, smoke scripts |
| UC-78 Backup & Restore | operator validates restore | workflow/runbook | Partial | `backup-restore-drill.yml`; restore evidence must be attached |
| UC-79 SIEM Export | logs/audit exported | audit export/log pipeline | Partial | `AuditTrailExportController`; SIEM sink verification out-of-repo |
| UC-80 JWKS Rotation Drill | rotate keys + validate clients | workflow/artisan | Ready | `jwks-rotation-simulation.yml`, `RotateSigningKeysCommand.php` |
| UC-81 External IdP Pilot | federation login pilot | `/external-idp/start/{providerKey}`, callback | Partial/Phase | `ExternalIdpPublicCallbackRouteContractTest.php`; UI/provider rollout pending |
| UC-82 Incident Runbook | trace incident by request/error ref | logs/audit/metrics | Partial | `ErrorRefPropagationContractTest.php`, `RequestLifecycleObservabilityTest.php`; formal runbook evidence pending |
| UC-83 DR Failover | service fails over/recovered | workflow/infra drill | Partial/Phase | deployment/backup workflows; DR exercise evidence pending |

## 8. Frontend UAT Entrypoints

| Page/flow | Route | UC coverage | Notes |
| --- | --- | --- | --- |
| Login | `/` | UC-11, UC-14, UC-18, UC-20 | guest route hydrates existing session; `prompt=login` bypasses guest redirect |
| Register | `/auth/register` | supporting auth | backend route exists; validate product decision for public registration |
| Callback | `/auth/callback` | UC-12, UC-17 | BFF callback exchange; no tokens in browser response |
| Consent | `/auth/consent` | UC-13, UC-21 | scope labels + safe deny UX |
| MFA challenge | `/auth/mfa-challenge` | UC-67 | challenge token flow; recovery path |
| Forgot/reset password | `/auth/forgot-password`, `/auth/reset-password` | UC-37 | no account enumeration |
| Portal home | `/home` | session smoke | loads profile-connected summaries independently |
| Profile | `/profile` | UC-34, UC-35 | self-service profile |
| Connected apps | `/apps` | UC-38, UC-39 | revoke app consent/tokens |
| Sessions | `/sessions` | UC-40, UC-49 | revoke session/all sessions |
| Security | `/security` | UC-36 | change password |
| MFA settings | `/security/mfa` | UC-66, UC-69 | TOTP + recovery lifecycle |
| Privacy/DSR | `/privacy` | UC-41, UC-42 | intake ready; fulfillment automation partial |

## 9. Backend UAT Entrypoints

| Area | Routes | UC coverage |
| --- | --- | --- |
| Metadata | `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/jwks` | UC-01, UC-02, UC-08, UC-31, UC-77 |
| OAuth/OIDC | `/authorize`, `/oauth2/authorize`, `/token`, `/oauth2/token`, `/userinfo`, `/introspect`, `/oauth2/introspect`, `/revocation`, `/oauth/revoke` | UC-10–UC-33 |
| Session/logout | `/connect/register-session`, `/connect/logout`, `/connect/logout/frontchannel`, `/connect/backchannel/admin-panel/logout` | UC-43–UC-48 |
| Auth portal | `/api/auth/session`, `/api/auth/login`, `/api/auth/logout`, password reset/register | UC-11, UC-37, UC-43 |
| MFA | `/api/mfa/status`, `/api/mfa/totp/enroll`, `/api/mfa/totp/verify`, `/api/mfa/challenge/verify`, recovery codes | UC-66–UC-69 |
| Profile | `/api/profile`, `/api/profile/change-password`, `/api/profile/audit`, connected apps, sessions, DSR | UC-34–UC-42 |
| Admin | `/admin/api/*` | UC-50–UC-65, UC-73, UC-76 |
| External IdP | `/external-idp/start/{providerKey}`, `/external-idp/callback` | UC-81 |
| Ops | `/health`, `/ready`, `/_internal/performance-metrics`, `/_internal/queue-metrics` | UC-77, UC-82 |

## 10. UAT Blockers & Risks

| ID | Severity | Area | Finding | UAT decision |
| --- | --- | --- | --- | --- |
| UAT-B01 | High | Admin browser UI | Backend admin APIs exist, but no full admin UI in `services/sso-frontend`; portal intentionally excludes admin. | Do not run admin click-path UAT in portal. Use API UAT or wait for dedicated admin app. |
| UAT-B02 | Medium/High | DSR | User can submit/list requests; full delete/anonymize queued automation + legal-hold/retention gate still partial. | Sign off intake only; mark fulfillment automation pending. |
| UAT-B03 | Medium/High | BFF session | Portal BFF uses encrypted HttpOnly token bundle cookie, not opaque server-side session handle. | Not a functional blocker; security hardening backlog before high-assurance signoff. |
| UAT-B04 | Medium | Ops | Backup/DR/SIEM evidence depends on operator drills outside app code. | Require dated drill artifacts for UC-78/79/83 signoff. |
| UAT-B05 | Medium | Security risk | Risk-score, device inventory, IP allow/block controls are partial/phase-driven. | Keep UC-68/70/72/75 as partial unless product declares reduced MVP scope. |
| UAT-B06 | Medium | Local validation | Local frontend `node_modules` was corrupted during prior validation attempts; CI/deploy evidence is authoritative. | Repair local deps before offline UAT automation. |

## 11. Recommended UAT Execution Order

1. **Smoke gate:** metadata/JWKS, login cookie survival, session hydration.
2. **Core user journey:** login → profile → password change → sessions/apps → logout.
3. **OIDC RP journey:** authorize → consent → callback → token → userinfo → refresh → revoke.
4. **Negative security:** invalid redirect, invalid PKCE, bad client secret, expired token, throttle.
5. **MFA:** enroll → login challenge → recovery code → regenerate/remove.
6. **DSR:** submit export/delete → list status → admin review/fulfill API if in scope.
7. **Admin API:** dashboard, users, roles, clients, audit export, sessions, security policy.
8. **Ops drill:** key rotation, health/readiness, backup/restore, incident request ID trace.

## 12. Concrete UAT Test Cases

### UAT-001 — Portal Login + Cookie Proxy Regression

- **Maps:** UC-11, UC-43, FR-017, FR-039
- **Precondition:** active user.
- **Steps:** login at `https://sso.timeh.my.id`; open devtools network; inspect login/callback responses; then call `/api/auth/session`, `/api/profile/sessions`, `/api/profile/connected-apps`.
- **Expected:** all required cookies present; APIs return 200; no post-login 401 loop.
- **Evidence:** HAR redacted + request IDs.
- **Code:** `services/sso-frontend/src/server/proxy-headers.ts`, `services/sso-frontend/src/server/__tests__/proxy-headers.spec.ts`.

### UAT-002 — Authorization Code + PKCE Happy Path

- **Maps:** UC-10, UC-12, UC-17, UC-22, FR-013, FR-023, FR-029
- **Steps:** RP sends authorize request with state/nonce/code_challenge; user logs in; consent if needed; RP exchanges code with verifier.
- **Expected:** single-use code; token set issued; replay/invalid verifier rejected.
- **Evidence:** request IDs, token response redacted.

### UAT-003 — Consent Allow/Deny

- **Maps:** UC-13, UC-21, FR-011, FR-026, FR-028
- **Steps:** request non-default scopes; verify consent page; allow; repeat; deny.
- **Expected:** allow stores consent and resumes; deny returns standard safe OAuth error.

### UAT-004 — MFA Enrollment + Challenge

- **Maps:** UC-66, UC-67, UC-69, FR-018–FR-020
- **Steps:** enroll TOTP; save recovery codes; logout; login; verify TOTP; regenerate recovery codes.
- **Expected:** MFA required, AMR persisted, recovery codes one-time and rotated.

### UAT-005 — Connected App Revocation

- **Maps:** UC-38, UC-39, FR-026, FR-034, FR-048
- **Steps:** authorize client; open `/apps`; revoke app; try refresh/userinfo with old token.
- **Expected:** app disappears/marked revoked; tokens/consent invalidated per policy.

### UAT-006 — Active Session Revocation

- **Maps:** UC-40, UC-49, FR-044, FR-048
- **Steps:** login from two browsers; open `/sessions`; revoke other session; revoke all.
- **Expected:** target session loses access; current UX remains safe; audit event recorded.

### UAT-007 — Safe Error & Correlation

- **Maps:** UC-16, UC-17, UC-30, UC-63, FR-060–FR-063
- **Steps:** trigger invalid redirect, invalid PKCE, bad secret, expired token.
- **Expected:** no stack traces/secrets; safe localized copy; request/error ref present.

### UAT-008 — Admin API Governance

- **Maps:** UC-50–UC-65, UC-73, UC-76
- **Steps:** authenticated admin calls `/admin/api/me`, dashboard, users, roles, clients, audit export, sessions, security policy.
- **Expected:** RBAC + MFA/freshness enforced; writes require step-up; audit events recorded.
- **Limitation:** API-only in current scope.

### UAT-009 — DSR Intake

- **Maps:** UC-41, UC-42, FR-049
- **Steps:** submit export request; submit delete/anonymize request; list requests; admin reviews if in scope.
- **Expected:** subject-scoped list, no-store cache, status visible.
- **Limitation:** delete/anonymize automation pending.

### UAT-010 — Ops Drill Minimum

- **Maps:** UC-77–UC-83
- **Steps:** run health/readiness checks; rotate JWKS in staging; run backup restore drill; trace incident request ID.
- **Expected:** dated artifacts retained; no secret leakage; rollback plan verified.

## 13. Signoff Criteria

A UC can be signed off only if:

1. UAT scenario executed in prod-like env.
2. Expected result matches requirement.
3. Evidence captured with secrets/tokens redacted.
4. Matching automated contract exists or gap accepted.
5. Defects categorized as blocker/major/minor and linked to UC/FR.

### 13.1 Signoff Buckets

| Bucket | Meaning |
| --- | --- |
| UAT-PASS | user-facing or API behavior verified. |
| UAT-PASS-WITH-RISK | works, but documented hardening/ops risk remains. |
| UAT-PARTIAL | only intake/API/subflow works; full business outcome pending. |
| UAT-BLOCKED | cannot execute because UI/env/data/integration missing. |
| UAT-NOT-IN-SCOPE | belongs to another service/phase. |

## 14. Next Actions

1. Run **UAT-001** immediately after deploy: confirms login 401 regression fixed.
2. Create UAT evidence folder/run log per execution date using `docs/audits/fr-uc-sso-uat-runbook-template.md`.
3. Define admin UI UAT separately for `services/sso-admin-vue`; do not put admin pages back into `services/sso-frontend`.
4. Add DSR fulfillment automation UAT once queue/legal-hold/delete-anonymize implementation lands.
5. Add operator drill artifacts for UC-78/79/83 before claiming full operations signoff.
6. Repair local frontend dependencies if local Vitest/browser UAT automation is needed.
