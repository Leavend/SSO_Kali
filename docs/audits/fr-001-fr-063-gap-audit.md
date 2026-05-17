# FR-001–FR-063 SSO Live Codebase Gap Audit

**Tanggal:** 2026-05-16
**Scope:** `services/sso-backend`, `services/sso-frontend`, `services/sso-admin-vue`
**Audit baseline:** `3e45cc2` (`main`)
**Requirement Source:** `docs/requirements/fr_uc_sso_practical_reader.md`
**Source Audits:**

- `docs/audits/fr-001-fr-020-gap-audit.md`
- `docs/audits/fr-021-fr-028-gap-audit.md`
- `docs/audits/fr-029-fr-063-gap-audit.md`

**Standards:**

- `services/sso-backend/TDD-standart-prod.md`
- `services/sso-backend/standart-quality-code.md`
- `services/sso-frontend/TDD-standart-prod.md`
- `services/sso-frontend/standart-quality-code.md`
- `services/sso-frontend/design.md`

## 1. Executive Summary

Audit ini adalah deep-dive ulang terhadap kondisi nyata repo untuk FR-001 sampai FR-063. Tiga audit lama tetap menjadi riwayat gap; dokumen ini menjadi **ledger terkini**: mana yang sudah ditutup oleh code/test, mana yang masih gap, dan mana yang perlu tidak dikerjakan di service yang salah.

Kondisi terkini:

1. `services/sso-backend` sudah menutup mayoritas gap protokol OIDC, token lifecycle, session/logout, profile, admin API, federation core, dan safe-error backend.
2. `services/sso-frontend` sekarang **portal SSO only**: auth, consent, MFA, profile, security, sessions, connected apps, privacy/DSR. Tidak ada `/admin/*` aktif.
3. `services/sso-admin-vue` masih canary/skeleton; ini lokasi benar untuk admin UI berikutnya, tetapi belum punya dashboard/users/audit/clients/security-policy screens.
4. Critical historical gaps seperti missing introspection, cache-only RP session registry, missing front-channel fallback, raw OIDC error, DSR workflow, audit export, security policy versioning, internal metrics guard, and circuit breaker **sudah punya production code + contract tests**.
5. Update hardening 2026-05-17 menutup beberapa gap operasional: external IdP public callback, deploy BFF same-origin boundary, active BFF proxy `/introspect`/front-channel logout, admin audit retention scheduler, DSR controller/FormRequest cleanup, dan callback API `apiClient` parity. Remaining highest-risk gaps sekarang: **admin UI delivery**, **BFF opaque server-side session**, **DSR delete/anonymize automation**, dan **frontend BFF hardening follow-up**.

## 2. Non-Negotiable Scope Boundary

| Area | Current owner | Audit rule |
| --- | --- | --- |
| SSO user portal | `services/sso-frontend` | Auth/profile/security/privacy only. Do not re-add admin routes here. |
| Admin governance UI | `services/sso-admin-vue` or successor | Build admin dashboard/users/audit/clients/policy here. |
| Admin API/backend | `services/sso-backend` | Existing `/admin/api/*` is backend source of truth. |
| Token/session/OIDC protocol | `services/sso-backend` | Keep controllers thin, actions/services stateless, tests contract-backed. |
| Browser token handling | `services/sso-frontend` BFF | Browser must not receive raw OAuth tokens. Same-origin BFF boundary should be locked. |

## 3. Highest Priority Live Gaps

### LIVE-001 — Dedicated Admin UI Is Still Skeleton

- **Severity:** High
- **FR/UC:** FR-050–FR-055 / UC-51–UC-65
- **Area:** `services/sso-admin-vue`
- **Evidence:** `services/sso-admin-vue/src/router/index.ts` routes only `/` to `HomeView.vue`; `services/sso-admin-vue/src` contains readiness/status components only.
- **Current backend evidence:** `routes/admin.php` exposes dashboard, users, roles, sessions, clients, external IdPs, DSR, audit export, security policies, and SSO error templates.
- **Issue:** Operators have backend APIs but no shipped dedicated admin UI for dashboard/user lifecycle/audit export/client controls/security policies.
- **Acceptance Criteria:**
  - Admin app has RBAC-aware dashboard summary, user lifecycle, audit/integrity/export, client lifecycle/scope, security policy, external IdP screens.
  - No admin UI reintroduced in `services/sso-frontend`.
  - UI consumes same-origin/admin BFF or properly session-bound backend route; no token in browser storage.
- **Test Plan:** Admin app unit/component tests for route guards, permission hiding, loading/safe error states, destructive confirmations.

### LIVE-002 — External IdP Public Callback Routed End-to-End (Closed 2026-05-17)

- **Severity:** Closed / monitor
- **FR/UC:** FR-057, FR-058 / UC-81
- **Area:** External federation
- **Fix evidence:** `routes/web.php` now registers `GET /external-idp/callback`; `CompleteExternalIdpCallbackAction` validates state via `ExternalIdpAuthenticationRedirectService::peek()/pull()`, exchanges callback code, maps/links subject, creates an SSO session, and redirects to a safe frontend path; `ExternalIdpCallbackController` emits no-store redirects and a secure SSO cookie.
- **Contract evidence:** `ExternalIdpPublicCallbackRouteContractTest` covers successful browser callback, no upstream token leakage, replayed state, and missing state failure.
- **Residual risk:** Add more browser-route negatives for wrong issuer/nonce/missing email under `reject`; current lower-level action/service tests already cover most token/claim failures.

### LIVE-003 — Frontend Deploy/Proxy BFF Boundary Locked (Closed 2026-05-17)

- **Severity:** Closed / monitor
- **FR/UC:** FR-013, FR-017, FR-045–FR-049, FR-061, FR-063
- **Area:** `services/sso-frontend` deployment boundary
- **Fix evidence:** `.github/workflows/deploy-main.yml` now builds `sso-frontend` with `VITE_SSO_API_URL=` so browser API calls default to same-origin BFF. Runtime upstream remains server-only via `SSO_INTERNAL_BASE_URL` in `docker-compose.main.yml`. Active Node BFF route inventory now proxies `/introspect`, `/oauth2/introspect`, `/connect/logout`, and `/connect/logout/frontchannel`.
- **Contract evidence:** `services/sso-frontend/src/__tests__/deploy-bff-boundary.test.ts` locks deploy args against direct `https://api-sso...` API URL; `src/server/__tests__/proxy-routes.spec.ts` locks FR-036/FR-043 proxy paths.
- **Residual risk:** Document any future direct-backend CORS mode as an explicit exception with separate guard tests.

### LIVE-004 — Portal BFF Uses Encrypted Token Cookie, Not Opaque Server-Side Session

- **Severity:** Medium/High
- **FR/UC:** FR-013, FR-017, FR-037, FR-063
- **Area:** `services/sso-frontend/src/server/session.ts`
- **Evidence:** `PortalSession` stores `accessToken`, `idToken`, and `refreshToken`; `sessionCookie()` encrypts JSON into `__Host-sso-portal-session` HttpOnly Secure cookie.
- **Issue:** Browser JS cannot read tokens, so FE-FR013 is closed. However the cookie itself is a bearer-equivalent encrypted token bundle. Stronger BFF posture is opaque session ID in cookie + server-side Redis/session store for OAuth tokens.
- **Acceptance Criteria:**
  - Cookie holds only opaque session ID / handle.
  - Tokens stored server-side with TTL, rotation, revocation, and request-id audit.
  - Logout clears server-side token record and downstream backend session.
- **Test Plan:** Cookie payload cannot decrypt to token fields client-side; server session store TTL/revoke tests; stolen stale handle rejected after logout/absolute TTL.

### LIVE-005 — DSR Controller Standard Cleanup Done; Delete/Anonymize Automation Pending

- **Severity:** Medium/High
- **FR/UC:** FR-049 / UC-41, UC-42, UC-65
- **Area:** Data Subject Rights
- **Fix evidence:** `StoreDataSubjectRequest` provides dedicated validation; `DataSubjectRequestController` delegates self-service listing/presentation to `DataSubjectRequestService::listForSubject()` / `present()` and no longer uses inline `$request->validate()` or controller loops for self-service DSR.
- **Contract evidence:** `DataSubjectRequestSelfServiceContractTest` covers FormRequest validation, subject-scoped listing, safe presentation, and no-store cache policy.
- **Remaining issue:** `delete`/`anonymize` fulfilment still returns summary payloads; full queued dry-run/execute workflow with retention/legal-hold policy remains open.
- **Next acceptance:** Queue jobs for delete/anonymize, auditable dry-run artifact, retry/dead-letter audit, retention/legal-hold gate.

### LIVE-006 — Admin Audit Retention Scheduler Locked (Closed 2026-05-17)

- **Severity:** Closed / monitor
- **FR/UC:** FR-052 / UC-58, UC-59, UC-79
- **Area:** Admin audit retention
- **Fix evidence:** `routes/console.php` schedules `sso:prune-admin-audit-events` daily with `withoutOverlapping()`.
- **Contract evidence:** `AdminAuditRetentionComplianceEvidenceTest` locks scheduler registration, dry-run option, command signature, and minimum retention constant.
- **Residual risk:** HMAC-chain retention/compaction design should be documented before aggressive pruning beyond current safe defaults.

### LIVE-007 — Callback API Uses Central `apiClient` (Closed 2026-05-17)

- **Severity:** Closed
- **FR/UC:** FR-013, FR-061, FR-063
- **Area:** `services/sso-frontend/src/services/oidc-callback.api.ts`
- **Fix evidence:** `completeOidcCallback()` now calls `apiClient.post('/auth/callback', input)` so callback POST gets `X-Request-ID`, XSRF, credentials, timeout, Accept-Language, and normalized `ApiError`.
- **Contract evidence:** `oidc-callback.api.spec.ts` now asserts callback code/state goes through `apiClient` and response never exposes OAuth tokens.

## 4. Shipped Evidence Ledger — FR-001–FR-028

| FR | Current status | Production evidence | Contract evidence |
| --- | --- | --- | --- |
| FR-001/005 | Closed | `OidcCatalog`, `DiscoveryController`, canonical `/authorize`, `/token`, `/jwks` metadata | `DiscoveryDocumentTest`, `DiscoveryAuthMethodContractTest`, `OidcProtocolRouteContractTest` |
| FR-002 | Closed | `JwksController`, `SigningKeyService`, FE BFF JWKS validation | `JwtValidationClaimContractTest`, `auth-callback-jwks.spec.ts` |
| FR-004/011 | Closed/monitored | `ScopePolicy`, `ConsentService`, `default_scopes` excludes `offline_access` | `OfflineAccessPolicyContractTest`, `ConsentFlowContractTest`, `ConsentInvalidScopeContractTest` |
| FR-006–012 | Backend closed; admin UI pending | Admin client APIs, secret lifecycle, suspend/decommission revocation | `AdminClientIntegrationContractTest`, `ClientSecretLifecycleContractTest`, `ClientLifecycleTokenRevocationContractTest` |
| FR-013 | Frontend closed with hardening note | BFF callback exchanges code server-side; secure HttpOnly cookie | `callback-session-cookie.spec.ts`, `auth-callback-jwks.spec.ts` |
| FR-014/016 | Closed | `VerifyLocalPasswordLoginAction`, `LoginAttemptThrottle` via Laravel RateLimiter | `LocalLoginPathConsolidationContractTest`, `LoginApiTest` |
| FR-017 | Closed/monitored | `SsoSessionCookieFactory`, `SsoSessionCookiePolicy`, frontend host cookie tests | `ProfilePortalSessionCookieContractTest`, `cookies.test.ts` |
| FR-018–020 | Closed/monitored | MFA enrollment/challenge/recovery/admin reset | `TotpEnrollmentContractTest`, `MfaChallengeContractTest`, `LostFactorRecoveryWorkflowContractTest` |
| FR-021 | Closed | `acr_values`, `max_age`, MFA continuation enforcement | `LocalLoginAcrEnforcementContractTest`, `MaxAgeEnforcementContractTest`, `StepUpAuthenticationTest` |
| FR-022 | Closed | `SsoSessionLifecycleGuard`, user lock/disable/password-expiry checks | `SsoSessionLifecycleGuardContractTest`, `UserManagementBackendTest` |
| FR-023–025 | Closed | No invalid-scope downgrade, stale consent revalidation, refresh downscope reject | `LocalLoginInvalidScopeContractTest`, `MfaContinuationInvalidScopeContractTest`, `ConsentStaleClientContractTest`, `RefreshTokenDownscopeContractTest` |
| FR-026 | Closed/monitored | Connected apps pagination + revocation impact | `ConnectedAppsPaginationContractTest`, `ConnectedAppsSelfServiceRevocationContractTest` |
| FR-027/028 | Closed | Prompt-none semantics + safe OIDC errors | `PromptNoneSemanticsContractTest`, `OidcErrorShapeConsistencyContractTest`, `oauth-error-message.spec.ts` |

## 5. Shipped Evidence Ledger — FR-029–FR-063

| FR | Current status | Production evidence | Contract evidence |
| --- | --- | --- | --- |
| FR-029 | Closed | `ExchangeToken`, `AuthorizationCodeStore` | `AuthorizationCodeExchangeEdgeContractTest`, `TokenEndpointHardeningContractTest` |
| FR-030 | Closed | `IssueIdToken`, `UserClaimsFactory` | `IdTokenClaimsMatrixContractTest` |
| FR-031 | Closed as global-audience MVP | `AccessTokenGuard`, `config/sso.php` `resource_audience` policy note | `AccessTokenAudiencePolicyContractTest` |
| FR-032 | Closed | `RefreshTokenStore::rotateAtomic()`, `LocalTokenService::rotate()` | `AtomicRefreshRotationContractTest`, `RefreshTokenRotationReplayContractTest` |
| FR-033 | Closed | `ExchangeToken::recordRefreshReuse()`, `RefreshTokenReuseDetectedNotification` | `RefreshTokenReuseAuditContractTest`, `TokenLifecycleAuditContractTest` |
| FR-034 | Closed | `RevokeToken` uses `TokenClientAuthenticationResolver` | `RevocationBasicAuthContractTest`, `PublicClientRevocationContractTest`, `RevocationEndpointRfc7009ContractTest` |
| FR-035 | Closed | `BuildUserInfo` no empty-scope profile/email fallback | `UserInfoPassportEmptyScopeContractTest`, `UserInfoEndpointClaimsContractTest` |
| FR-036 | Closed | `IntrospectionController`, `IntrospectToken`, `/introspect`, `/oauth2/introspect`, discovery advertises endpoint | `IntrospectionContractTest` |
| FR-037 | Closed with BFF hardening note | `LogoutSsoSessionAction` fan-out, refresh/access/RP revocation | `PortalLogoutFanOutContractTest` |
| FR-038 | Closed | `TokenLifetimePolicy`, deploy guard command | `TokenLifetimePolicyContractTest` |
| FR-039 | Closed | `SsoSessionLifecycleGuard`, atomic lifecycle handling | `SessionLifecycleAtomicContractTest`, `SessionIdleTimeoutContractTest` |
| FR-040 | Closed | `oidc_rp_sessions`, `BackChannelSessionRegistry` DB source of truth | `RpSessionRegistryPersistenceContractTest` |
| FR-041 | Closed | `PerformSingleSignOut` sid/sub binding | `IdTokenHintSidBindingContractTest` |
| FR-042 | Closed | `LogoutTokenReplayStore`, `LocalLogoutTokenVerifier` | `LocalLogoutTokenVerifierReplayTest` |
| FR-043 | Closed | Front-channel logout URI support + iframe fallback | `FrontChannelLogoutFallbackContractTest`, `FrontChannelLogoutFlowTest` |
| FR-044 | Closed/monitored | logout idempotency + request-id propagation in dispatcher/job | `CentralizedLogoutTest`, `BackChannelLogoutPartialFailureContractTest` |
| FR-045 | Closed | `ProfilePortalPresenter`, minimized UserInfo/profile payloads | `ProfilePortalBackendContractTest`, `profile-privacy.contract.test.ts` |
| FR-046 | Partial | Self-service update remains name-only; admin email sync clears verification | `ProfilePortalBackendContractTest`, `UserManagementBackendTest` |
| FR-047 | Closed | change password + reset request/confirm + session revocation | `ChangePasswordContractTest`, `PasswordResetLifecycleContractTest`, `use-password-lifecycle.contract.test.ts` |
| FR-048 | Closed/monitored | connected apps + sessions aggregate RP registry/refresh/consent | `ConnectedAppsSelfServiceRevocationContractTest`, `UserSessionsSelfServiceContractTest` |
| FR-049 | Partial | DSR submit/list/review/fulfill/export exists; self-service controller now uses FormRequest/service presentation; delete/anonymize automation pending | `AdminGovernanceContractTest`, `DataSubjectRequestSelfServiceContractTest`, `privacy-page.contract.test.ts` |
| FR-050 | Backend closed; UI pending | `DashboardSummaryController`, `AdminDashboardSummaryService` | `AdminGovernanceContractTest` |
| FR-051 | Backend closed; UI pending | lock/unlock/deactivate/reactivate/reset/sync APIs | `AdminGovernanceContractTest`, `UserManagementBackendTest` |
| FR-052 | Backend closed; UI pending | audit list/show/integrity/export + scheduled prune command | `AdminGovernanceContractTest`, `AdminAuditTrailContractTest`, `AdminAuditRetentionComplianceEvidenceTest` |
| FR-053 | Backend closed; UI pending | least-privilege role catalog in `AdminPermission`/`RbacSeeder` | `AdminGovernanceContractTest`, `RolePermissionManagementBackendTest` |
| FR-054 | Backend closed; UI pending | client lifecycle/scope/secret APIs | `ClientManagementCrudBackendTest`, `ClientScopeManagementBackendTest` |
| FR-055 | Backend closed; UI pending | `SecurityPolicy` aggregate + admin endpoints | `SecurityPolicyAndFederationContractTest` |
| FR-056 | Closed | `EnsureInternalMetricsToken` on `_internal/*` | `InternalMetricsTokenGuardTest` |
| FR-057 | Backend closed; UI/admin pending | public start route + public callback route + config | `SecurityPolicyAndFederationContractTest`, `ExternalIdpPublicCallbackRouteContractTest`, ExternalIdP action tests |
| FR-058 | Backend closed | mapping preview service/controller + missing-email policy | `SecurityPolicyAndFederationContractTest`, `ExternalIdpClaimsMappingContractTest` |
| FR-059 | Closed | scheduled health probe + circuit breaker counters | `ExternalIdpCircuitBreakerContractTest` |
| FR-060 | Closed | `OidcErrorCatalog` central registry | `OidcErrorCatalogContractTest` |
| FR-061 | Closed/monitored | locale-backed `ApiError`; OAuth copy still tested in TS helper | `api-error.spec.ts`, `oauth-error-message.spec.ts` |
| FR-062 | Closed | `OidcErrorResponse`, `SafeOidcExceptionRenderer`, safe scrubber | `SafeErrorDescriptionContractTest`, `OidcErrorResponseTest` |
| FR-063 | Closed/monitored | `X-Request-Id`, `X-Error-Ref`, FE support references | `ErrorRefPropagationContractTest`, `api-error.spec.ts`, `oauth-error-message.spec.ts` |

## 6. Service-Specific Audit Notes

### 6.1 `services/sso-frontend`

- Active router (`src/router/index.ts`) exposes only `auth.*`, `portal.*`, and `error.not-found` routes.
- `src/web/**` legacy/admin tree is removed from the current baseline.
- Portal pages in scope: login/register/callback/consent/MFA/forgot/reset, home/profile/security/MFA settings/sessions/apps/privacy.
- Admin routes/pages/services must remain out of this service.
- Current hardening backlog: consider opaque server-side BFF session store; address frontend audit follow-ups for prod session-secret fail-closed, MFA QR privacy, excluded tests, stale E2E assertions, and safe error display consistency.

### 6.2 `services/sso-admin-vue`

- Canary app only; currently no admin governance features beyond readiness/status UI.
- Required next milestone: route scaffold + auth principal bootstrap + permission-aware shell + first admin dashboard page.
- Must follow Vue/TDD/design standards equivalent to the SSO portal, with admin-specific design documented before broad UI work.

### 6.3 `services/sso-backend`

- Protocol/token/session base is strong and contract-rich.
- Remaining backend issues are mostly orchestration/completeness: DSR delete/anonymize automation and admin UI delivery. External IdP callback route, admin audit scheduler, and DSR controller standard cleanup are now fixed.
- New endpoints must use FormRequest for input and keep controllers thin; existing DSR controller should be refactored before expanding deletion/anonymization.

## 7. Revised Priority Queue

1. **P0:** Build `services/sso-admin-vue` admin shell + dashboard + audit/user/client route skeleton behind permission model.
2. **P1:** Add DSR delete/anonymize queued dry-run/execute workflow with retention/legal-hold policy.
3. **P1:** Move portal BFF token bundle from encrypted cookie to opaque server-side session store.
4. **P1:** Close remaining frontend audit hardening gaps: prod session-secret fail-closed, local MFA QR generation, excluded specs, stale E2E, safe error display consistency.
5. **P2:** Complete dedicated admin UI pages for user lifecycle, audit export/integrity, clients, roles, security policies, external IdPs.
6. **Done 2026-05-17:** `VITE_SSO_API_URL=''` deploy boundary + BFF `/introspect`/front-channel logout proxy guard tests.
7. **Done 2026-05-17:** External IdP public callback route/controller + replay-safe route test.
8. **Done 2026-05-17:** Admin audit prune scheduler + evidence test.
9. **Done 2026-05-17:** DSR self-service FormRequest/service presentation cleanup + tests.
10. **Done 2026-05-17:** `oidc-callback.api.ts` migrated to `apiClient`.

## 8. Validation Contract for Future Fixes

Backend:

```bash
cd services/sso-backend
vendor/bin/pint --test
vendor/bin/phpstan analyse --memory-limit=512M
vendor/bin/pest <relevant tests>
```

Frontend portal:

```bash
cd services/sso-frontend
npm run lint
npm run typecheck
npx vitest run
npm run build
```

Admin Vue:

```bash
cd services/sso-admin-vue
npm run lint
npm run typecheck
npm run test
npm run build
```

Deploy:

- Push only after local validation passes.
- Required GHA: `CI`, `SSO Backend CI`, relevant service CI/CD, `Deploy Main to VPS`.
- Runtime behavior changes require smoke against auth/session/logout/token/admin route touched.

## 9. Audit Closure Rules

1. A historical finding can be closed only by citing production code and a contract test.
2. A closed finding can be reopened only with a failing test or a newly identified bypass path.
3. `services/sso-frontend` admin gaps must not be fixed by re-adding admin UI to the SSO portal.
4. Docs-only audit changes still require CI/deploy per current operating policy because `deploy-main.yml` builds images on every push to `main`.
