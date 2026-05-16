# FR-029–FR-063 SSO Gap Audit

**Tanggal:** 2026-05-16  
**Scope:** `services/sso-backend`, `services/sso-frontend`  
**Requirement Source:** `docs/requirements/fr_uc_sso_practical_reader.md`  
**Reference Audit Format:** `docs/audits/fr-001-fr-020-gap-audit.md`, `docs/audits/fr-021-fr-028-gap-audit.md`  
**Standards:**

- `services/sso-backend/TDD-standart-prod.md`
- `services/sso-backend/standart-quality-code.md`
- `services/sso-frontend/TDD-standart-prod.md`
- `services/sso-frontend/standart-quality-code.md`
- `services/sso-frontend/design.md`

## 1. Executive Summary

Audit ini meninjau implementasi SSO terhadap **FR-029 sampai FR-063**:

- FR-029–FR-038 — Token Lifecycle
- FR-039–FR-044 — Session & Logout
- FR-045–FR-049 — User Profile & Self-Service
- FR-050–FR-056 — Admin & Governance
- FR-057–FR-059 — External IdP Integration
- FR-060–FR-063 — Error Handling & UX

Hasil audit: basis OIDC/token/session/admin sudah kuat dan banyak area MVP telah memiliki test contract. Gap terbesar ada pada **Token Introspection**, **front-channel logout fallback**, **persistent RP session registry**, **privacy/data subject workflow**, **admin audit export/retention**, **security policy management**, **public federation routes**, dan **backend safe-error hardening**.

### Highest Priority Themes

1. **Token lifecycle:** `/introspect` belum ada; refresh reuse sudah revoke family tetapi belum punya audit/security notification khusus.
2. **Logout/session:** Back-channel logout ada, tetapi RP session registry cache-only dan front-channel logout fallback belum ada.
3. **Profile/privacy:** Connected apps/session portal ada; data export/delete/anonymize workflow belum ada.
4. **Admin governance:** RBAC + MFA gate kuat; audit export/retention admin trail dan security policy console belum ada.
5. **Federation:** Services External IdP cukup lengkap, tetapi public login/callback route belum wired.
6. **Error safety:** FE aman dari raw `error_description`; BE masih punya beberapa path yang mengirim raw exception text ke `error_description`.
7. **Correlation:** `X-Request-Id` ada; `error_ref` dibuat tetapi belum disurface ke client/support UX dan belum konsisten across async/outbound calls.

## 2. Severity Legend

| Severity | Meaning | Expected Handling |
| --- | --- | --- |
| Critical | Risiko security/spec breakage besar atau production auth/compliance bypass. | Fix prioritas pertama, test-backed, deploy segera setelah validasi. |
| High | Risiko security/compliance/interoperability signifikan. | Masuk batch hardening awal. |
| Medium | Gap UX, policy, lifecycle, observability, atau scalability penting. | Jadwalkan setelah critical/high. |
| Low | Improvement/evidence/documentation gap. | Backlog reguler. |

## 3. Backend Findings

### BE-FR029-001 — Authorization Code Exchange Missing Full Client/Auth Edge Contract Evidence

- **Severity:** Medium
- **FR/UC:** FR-029 / UC-22, UC-30
- **Area:** `/token` authorization_code grant
- **Evidence:** `services/sso-backend/app/Actions/Oidc/ExchangeToken.php` pulls code before resolving client, validates client secret, redirect_uri equality, PKCE; `routes/oidc.php` exposes `/token` + `/oauth2/token` with `ValidateTokenOrigin`.
- **Issue:** Core flow exists, but edge evidence should explicitly lock one-time code consumption under invalid client/PKCE/redirect failure and HTTP Basic vs body precedence.
- **Acceptance Criteria:**
  - Code cannot be replayed after any token exchange attempt.
  - Invalid `redirect_uri`, invalid `code_verifier`, invalid client auth return OAuth-safe errors.
  - HTTP Basic client auth precedence is contract-tested.
  - No raw exception text in token errors.
- **Test Plan:** Feature tests for wrong redirect, wrong PKCE, Basic/body conflict, replay after failure/success.
- **Recommended Fix:** Add token endpoint hardening evidence around existing `ExchangeToken` behavior.

### BE-FR030-001 — ID Token Claims Strong, but `at_hash` / Claim Contract Matrix Missing

- **Severity:** Medium
- **FR/UC:** FR-030 / UC-19, UC-23
- **Area:** ID Token claims/signing
- **Evidence:** `UserClaimsFactory::idTokenClaims()` emits `iss`, `aud`, `azp`, `sub`, `sid`, `nonce`, `auth_time`, `amr`, `acr`, `iat`, `nbf`, `exp`; `SigningKeyService` signs via configured `ES256`.
- **Issue:** Authorization Code flow does not require `at_hash`, but RP validation evidence should lock claim matrix by scopes/ACR. Current tests are scattered.
- **Acceptance Criteria:**
  - ID token always has issuer/client audience/sub/iat/exp/nonce/sid.
  - `profile/email/roles/permissions` claims only appear when scope permits.
  - `auth_time`, `amr`, `acr` reflect MFA/step-up.
  - Signing alg/kid match JWKS.
- **Test Plan:** Decode issued ID token for password-only, MFA, profile/email, roles permissions, nonce mismatch.
- **Recommended Fix:** Add `IdTokenClaimsProfileContractTest` with table-driven claim assertions.

### BE-FR031-001 — Access Token Profile Good, but Resource Audience Is Single Global

- **Severity:** Medium
- **FR/UC:** FR-031 / UC-24, UC-32
- **Area:** JWT access token audience/profile
- **Evidence:** `UserClaimsFactory::accessTokenClaims()` sets `aud=config('sso.resource_audience')`, `client_id`, `token_use=access`, `scope`, `jti`, `sid`; `AccessTokenGuard` rejects invalid `iss`, `aud`, `exp`, `iat`, `token_use`, missing `jti/sub/sid/client_id`, inactive client.
- **Issue:** Wrong-audience defense exists for one global audience. Multi-resource audience/scoped audience policy is not represented, so resource servers cannot request/validate per-API audiences.
- **Acceptance Criteria:**
  - Access token `aud` is client/resource-policy derived or explicitly documented global.
  - Guard rejects wrong audience and inactive/decommissioned client.
  - UserInfo and resource checks respect scope.
- **Test Plan:** Tests for wrong `aud`, inactive client token, missing `sid`, access token with insufficient scope.
- **Recommended Fix:** Add per-resource audience policy or document `sso.resource_audience` as global MVP and add tests.

### BE-FR032-001 — Refresh Rotation Exists; Family Expiry/Concurrency Needs Stronger Evidence

- **Severity:** High
- **FR/UC:** FR-032 / UC-25, UC-33
- **Area:** Refresh token rotation
- **Evidence:** `RefreshTokenStore::issue()` stores `token_family_id`, `family_created_at`, secret hash, `expires_at`; `LocalTokenService::rotate()` issues replacement then revokes previous with `replaced_by_token_id`.
- **Issue:** Rotation works, but concurrent refresh requests may both read active token before revoke without DB row lock/atomic compare-and-swap. Family lifetime exists but needs explicit enforcement evidence.
- **Acceptance Criteria:**
  - Refresh token is single-use under concurrent requests.
  - Second use of rotated token revokes family.
  - Family max age enforced regardless individual token rotation.
  - Audit event emitted for rotation and replay.
- **Test Plan:** Concurrent refresh simulation, family age expiry, replay after rotation, refresh without `offline_access`.
- **Recommended Fix:** Wrap `findActive` + rotate/revoke in transaction with row lock; add replay/family expiry tests.

### BE-FR033-001 — Refresh Reuse Detection Revokes Family but Lacks Dedicated Audit/Notification

- **Severity:** High
- **FR/UC:** FR-033 / UC-26, UC-71
- **Area:** Refresh token replay detection
- **Evidence:** `RefreshTokenStore::isReuse()` detects revoked+replaced token with matching secret, `revokeFamily()` revokes active family and logs warning.
- **Issue:** Replay is security-critical. Current path logs warning but does not emit structured authentication audit, incident taxonomy, or user/admin security notification.
- **Acceptance Criteria:**
  - Replay emits `refresh_token_reuse_detected` audit with client/session/family hashes.
  - Family is revoked atomically.
  - User/security notification is queued (or explicit no-notify policy documented).
  - Subsequent family token use fails.
- **Test Plan:** Replay old refresh token → audit row + notification intent + family revoked.
- **Recommended Fix:** Inject audit/incident recorder into reuse path or return reuse outcome to `ExchangeToken` for centralized audit.

### BE-FR034-001 — Revocation Endpoint Is RFC7009-Compatible, but Basic Auth/Hint Contract Gaps Remain

- **Severity:** Medium
- **FR/UC:** FR-034 / UC-06, UC-09, UC-27, UC-39, UC-76
- **Area:** `/revocation`, `/oauth/revoke`
- **Evidence:** `RevokeToken` returns 200 for invalid clients per RFC 7009, supports refresh/access token revocation, hashes token in audit, best-effort upstream revoke.
- **Issue:** Client auth currently reads `client_secret` body in `RevokeToken::clientSecret()`; no evident use of `TokenClientAuthenticationResolver` / HTTP Basic precedence. `token_type_hint` unknown handling is permissive but not documented/tested.
- **Acceptance Criteria:**
  - Revocation supports Basic and body auth consistently with `/token`.
  - Public clients policy explicit.
  - Unknown token is idempotent 200 with audit.
  - `token_type_hint` unsupported values do not leak details.
- **Test Plan:** Basic auth revoke, body auth revoke, mismatched client, unknown token, unsupported hint.
- **Recommended Fix:** Reuse `TokenClientAuthenticationResolver` in `RevokeToken` and add contract tests.

### BE-FR035-001 — UserInfo Exists; Passport Fallback May Over-Expose Default Scopes

- **Severity:** Medium
- **FR/UC:** FR-035 / UC-24, UC-29
- **Area:** `/userinfo`
- **Evidence:** `BuildUserInfo` uses `AccessTokenGuard` for JWTs and `ClaimsView::userInfo($claims)`. Passport fallback defaults scopes to `openid profile email` when token scopes empty.
- **Issue:** Empty Passport scopes becoming profile+email can over-disclose claims if a resource token lacks explicit scopes.
- **Acceptance Criteria:**
  - UserInfo requires valid bearer token.
  - Claims emitted strictly from token scopes.
  - Unknown/expired/revoked token returns `invalid_token` safe JSON.
- **Test Plan:** Empty-scope Passport token → no profile/email unless explicitly scoped; revoked JWT → 401; missing bearer → safe 401.
- **Recommended Fix:** Remove permissive default fallback or limit Passport fallback to `openid` only.

### BE-FR036-001 — Token Introspection Endpoint Missing

- **Severity:** Critical
- **FR/UC:** FR-036 / UC-28, UC-29
- **Area:** RFC 7662 token introspection
- **Evidence:** Repo grep for `introspection|introspect` finds only test comments; no route in `routes/oidc.php`.
- **Issue:** Resource servers cannot validate opaque/remote tokens through RFC 7662. Unknown/expired token semantics (`active:false`) absent.
- **Acceptance Criteria:**
  - `POST /introspect` and `/oauth2/introspect` exist.
  - Client-authenticated and rate-limited.
  - Unknown/expired/revoked token returns `{active:false}` 200.
  - Active token returns `active, iss, sub, aud, client_id, scope, exp, iat, sid, token_type` according to caller authorization.
  - Audit/incident for invalid client auth.
- **Test Plan:** Active JWT, revoked JWT, expired JWT, unknown token, invalid client, wrong audience.
- **Recommended Fix:** Implement RFC 7662 action/controller using `AccessTokenGuard`, `RefreshTokenStore`, and `TokenClientAuthenticationResolver`.

### BE-FR037-001 — Token Binding to Session/Client Strong, but Portal Logout Does Not Fan Out to RPs

- **Severity:** High
- **FR/UC:** FR-037 / UC-32, UC-45, UC-46
- **Area:** Token session binding
- **Evidence:** Access/ID tokens include `sid`; `AccessTokenGuard` requires `sid/client_id`; `AccessTokenRevocationStore::track()` maps session to JTIs; `PerformSingleSignOut` revokes by sid.
- **Issue:** Portal logout uses `LogoutController` / `LogoutSsoSessionAction` and does not call `PerformSingleSignOut`, so RP sessions/tokens may survive a portal logout.
- **Acceptance Criteria:**
  - User-initiated portal logout revokes browser SSO, access token JTIs, refresh tokens, and RP registrations for that `sid`.
  - Back-channel notifications dispatched where registered.
  - Audit reports complete/partial logout.
- **Test Plan:** Login + register RP session + portal logout → refresh/userinfo rejected + BCL queued.
- **Recommended Fix:** Route portal logout through a safe variant of `PerformSingleSignOut` or explicitly trigger RP fan-out after local logout.

### BE-FR038-001 — Token Lifetime Config Exists but No Policy Bounds/Admin Versioning

- **Severity:** Medium
- **FR/UC:** FR-038 / UC-25, UC-33, UC-49, UC-62
- **Area:** Token lifetime policy
- **Evidence:** `config/sso.php` has `ttl.access_token_minutes`, `id_token_minutes`, `refresh_token_days`, `refresh_token_family_days`; `PruneTokens` scheduled daily.
- **Issue:** Lifetimes are env-only, no min/max guardrails or admin policy versioning. Misconfigured TTL can create too-long tokens without deployment guard evidence.
- **Acceptance Criteria:**
  - Access/ID/refresh TTL bounded by sane min/max.
  - Policy changes audited/versioned.
  - Existing refresh family max age enforced.
- **Test Plan:** Config boundary tests; family expiry tests; prune command tests for revoked/expired tokens.
- **Recommended Fix:** Add lifetime policy value object and deploy guard; later integrate with FR-055 security policy console.

### BE-FR039-001 — SSO Session Revocation-on-Read Is Not Race-Safe

- **Severity:** Medium
- **FR/UC:** FR-039 / UC-11, UC-43, UC-49
- **Area:** SSO session expiry/idle enforcement
- **Evidence:** `SsoSessionService::current()` revokes expired/idle sessions on read; no row lock noted in scout evidence.
- **Issue:** Concurrent heartbeats around idle expiry can race and extend a session while another request revokes it.
- **Acceptance Criteria:**
  - Expired/idle session cannot be extended by concurrent heartbeat.
  - Atomic update/revoke boundary used.
- **Test Plan:** Simulate concurrent heartbeat + current() on idle-expired row.
- **Recommended Fix:** Use transaction/`lockForUpdate` or atomic `UPDATE ... WHERE revoked_at IS NULL AND last_seen_at >= cutoff`.

### BE-FR040-001 — RP Session Registry Is Cache-Only

- **Severity:** High
- **FR/UC:** FR-040 / UC-44, UC-46
- **Area:** RP session registry
- **Evidence:** `BackChannelSessionRegistry` stores `oidc:backchannel-session:{sid}` in cache; `UserSessionsService` lists from refresh rotations.
- **Issue:** Cache eviction loses RP logout targets silently. Public clients without refresh tokens may never appear in profile/admin session views.
- **Acceptance Criteria:**
  - Persistent `oidc_rp_sessions` table keyed by `(sid, client_id)`.
  - Cache is acceleration, DB is source of truth.
  - Registry records `last_seen_at`, expiry, channel support.
- **Test Plan:** Register session, clear cache, global logout still notifies RP; public client visible.
- **Recommended Fix:** Add persistent RP session model and migrate `BackChannelSessionRegistry` to dual-write/read-through.

### BE-FR041-001 — RP-Initiated Logout Does Not Bind `id_token_hint.sid` to Current Session

- **Severity:** Medium
- **FR/UC:** FR-041 / UC-45
- **Area:** RP-initiated logout
- **Evidence:** `PerformFrontChannelLogout` validates client/PLRU and decodes `id_token_hint` audience.
- **Issue:** A stale valid `id_token_hint` can influence logout/audit without proving it matches the current browser session `sid/sub`.
- **Acceptance Criteria:**
  - If current SSO session exists, `id_token_hint.sid/sub` must match it.
  - If mismatch, safe `invalid_request` / confirmation path.
  - No open redirect or state leak.
- **Test Plan:** Valid hint for different sid + active cookie → rejected/no unrelated audit.
- **Recommended Fix:** Cross-check hint `sid/sub` before logout execution.

### BE-FR042-001 — Back-Channel Logout Inbound Replay Protection Missing

- **Severity:** High
- **FR/UC:** FR-042 / UC-46, UC-48
- **Area:** Back-channel logout JWT
- **Evidence:** `LogoutTokenService` issues `jti`; `LocalLogoutTokenVerifier` validates iss/aud/iat/exp/events/no nonce.
- **Issue:** `jti` is not persisted/checked on inbound admin-panel logout; same logout_token can be replayed until expiry.
- **Acceptance Criteria:**
  - Inbound logout token `jti` single-use until `exp`.
  - Replay returns idempotent safe success or explicit duplicate without repeated side effects.
- **Test Plan:** POST same logout_token twice → one effect, replay audit.
- **Recommended Fix:** Add `oidc_processed_logout_tokens` cache/table with TTL to `exp`.

### BE-FR043-001 — Front-Channel Logout Fallback Missing

- **Severity:** High
- **FR/UC:** FR-043 / UC-46, UC-47
- **Area:** OIDC Front-Channel Logout
- **Evidence:** Discovery advertises back-channel logout but not `frontchannel_logout_supported`; `DownstreamClient` has no `frontchannel_logout_uri`.
- **Issue:** Clients without BCL are skipped; no iframe fallback page.
- **Acceptance Criteria:**
  - Client registry supports `frontchannel_logout_uri`.
  - Discovery advertises FCL support when enabled.
  - Global logout returns/renders iframe fallback for non-BCL clients.
- **Test Plan:** Client with FCL only → logout page includes iframe with `iss` and `sid`; audit records notification.
- **Recommended Fix:** Implement OIDC Front-Channel Logout §3 fallback.

### BE-FR044-001 — Logout Idempotency/Correlation Incomplete Across Async BCL Jobs

- **Severity:** Medium
- **FR/UC:** FR-044 / UC-26, UC-40, UC-45, UC-48, UC-50, UC-76
- **Area:** Global logout audit/idempotency
- **Evidence:** `PerformSingleSignOut` emits start/completed audit; BCL job emits per-attempt success/failed; `RecordLogoutAuditEventAction` accepts `X-Request-Id`.
- **Issue:** Re-invocation can re-emit start/completed and dispatch duplicate logout tokens; queued jobs do not consistently carry parent `request_id`; no terminal dead-letter event after retries exhaust.
- **Acceptance Criteria:**
  - Logout operation deduped by sid/sub/correlation key.
  - Parent request_id propagated to all queued BCL audit events.
  - Retry exhaustion emits terminal dead-letter/partial outcome.
- **Test Plan:** Duplicate global logout requests; failed BCL retries; audit request_id continuity.
- **Recommended Fix:** Add cache lock/idempotency key and pass audit context into BCL jobs.

### BE-FR045-001 — Profile View Exists, but Profile Claim/API Contract Needs Explicit PII Evidence

- **Severity:** Low/Medium
- **FR/UC:** FR-045 / UC-34
- **Area:** Profile portal/API
- **Evidence:** `ShowProfilePortalAction`, `ProfileController`, `HomePage.vue`, `UserInfo` claim shaping exist from prior audits.
- **Issue:** Profile read behavior should explicitly prove PII minimization between portal API, UserInfo claims, and admin view.
- **Acceptance Criteria:**
  - Portal profile returns only self-service fields.
  - UserInfo returns claims only by scope.
  - Audit logs hash/redact PII.
- **Test Plan:** Portal profile JSON schema and UserInfo scope matrix.
- **Recommended Fix:** Add data-contract tests for profile payloads and audit redaction.

### BE-FR046-001 — Profile Update Email Verification Workflow Not Evident

- **Severity:** Medium
- **FR/UC:** FR-046 / UC-35, UC-54
- **Area:** Profile update + verification
- **Evidence:** `ProfileUpdateController` exists; admin profile sync/update exists.
- **Issue:** Need explicit email-change verification workflow evidence. Updating email directly can affect identity claims before verification.
- **Acceptance Criteria:**
  - Email change stores pending email and requires verification before becoming claim email.
  - Display name/profile updates validated and audited.
  - Admin edits have equivalent audit and verification policy.
- **Test Plan:** User changes email → old email remains in UserInfo until verified; verification token single-use/expiry.
- **Recommended Fix:** Add pending-email model/action and verification route or document deferred MVP.

### BE-FR047-001 — Password Change/Reset Lifecycle Needs End-to-End Session/Notification Evidence

- **Severity:** High
- **FR/UC:** FR-047 / UC-20, UC-36, UC-37, UC-71
- **Area:** Password self-service
- **Evidence:** Strong password rule and admin reset actions exist; FE has Security/MFA pages.
- **Issue:** User self-service password change/reset flow is not clearly wired end-to-end with current password verification, session invalidation, reset token single-use, and security notification.
- **Acceptance Criteria:**
  - Change password requires current password and strong new password.
  - Reset token single-use, expiring, hashed at rest.
  - Other sessions/tokens revoked after password change/reset.
  - Security notification/audit emitted.
- **Test Plan:** Change password success/failure, reset token replay, post-change old sessions rejected.
- **Recommended Fix:** Implement/lock self-service credential lifecycle contracts.

### BE-FR048-001 — Connected Apps/Sessions Exists, but Device Management and Public-Client Visibility Gaps Remain

- **Severity:** Medium
- **FR/UC:** FR-048 / UC-38, UC-39, UC-40, UC-70
- **Area:** Connected apps + active sessions
- **Evidence:** `ConnectedAppsService` now paginated; `RevokeConnectedAppAction` clears refresh/access/consent; `SessionsController` lists/revokes sessions.
- **Issue:** Device management (UC-70) and RP sessions without refresh tokens are not fully visible; session list aggregation via refresh rotations misses some clients.
- **Acceptance Criteria:**
  - Connected apps include all authorized clients, including public/no-refresh when applicable.
  - Active sessions include device metadata, last activity, and revoke reason.
  - Revoke effects are audited and visible.
- **Test Plan:** Public client code flow without offline access appears in connected/session registry; device revoke audit.
- **Recommended Fix:** Leverage persistent RP session registry from BE-FR040-001.

### BE-FR049-001 — Data Subject Rights Workflow Missing

- **Severity:** Critical
- **FR/UC:** FR-049 / UC-41, UC-42, UC-65
- **Area:** Privacy/data subject rights
- **Evidence:** No evident export/delete/anonymize workflow in profile/admin routes from scout; requirement source marks intake MVP.
- **Issue:** Users cannot request data export or deletion/anonymization; compliance evidence pack incomplete.
- **Acceptance Criteria:**
  - User can submit export/delete/anonymize request.
  - Admin/DPO can review, approve, reject, fulfill.
  - Request state machine audited with SLA timestamps.
  - Export excludes secrets and redacts sensitive fields.
- **Test Plan:** Create request, admin review, export artifact generation, delete/anonymize dry-run, audit chain.
- **Recommended Fix:** Add `data_subject_requests` workflow + admin review endpoints.

### BE-FR050-001 — Admin Dashboard Summary Missing

- **Severity:** Medium
- **FR/UC:** FR-050 / UC-52
- **Area:** Admin dashboard
- **Evidence:** `/admin/api/me` returns principal/capabilities/menus. `services/sso-admin-vue` is skeleton; real `sso-frontend` admin page focuses client management.
- **Issue:** No dashboard metrics/summary endpoint or UI for sessions, clients, audit, incidents.
- **Acceptance Criteria:**
  - Read-only dashboard summary under `admin.panel.view`.
  - Counts exclude sensitive details and are cached/bounded.
  - UI follows design system.
- **Test Plan:** Permission-gated dashboard summary and UI render.
- **Recommended Fix:** Add `GET /admin/api/dashboard/summary` + frontend dashboard card page.

### BE-FR051-001 — User Lifecycle Strong Backend, but Temporary Lock/UI Gaps Remain

- **Severity:** Medium
- **FR/UC:** FR-051 / UC-50, UC-53, UC-54, UC-55
- **Area:** Admin user lifecycle
- **Evidence:** Admin routes for create/deactivate/reactivate/password-reset/sync-profile/reset-mfa; MFA/step-up enforced.
- **Issue:** Temporary lock vs permanent disable distinction and admin UI coverage are incomplete.
- **Acceptance Criteria:**
  - Lock/unlock separate from disable/reactivate.
  - Reason, expiry, actor, and audit present.
  - UI supports lifecycle actions with confirmation.
- **Test Plan:** Lock expiry, unlock, disable, self-action prevention, UI affordances.
- **Recommended Fix:** Add explicit lock model fields/actions and frontend user management.

### BE-FR052-001 — Admin Audit Export and Retention Missing

- **Severity:** Critical
- **FR/UC:** FR-052 / UC-26, UC-41, UC-42, UC-57, UC-58, UC-59, UC-63, UC-65, UC-79
- **Area:** Audit log/export/retention
- **Evidence:** `AdminAuditEventStore` HMAC chain, `AdminAuditIntegrityVerifier`, `AuditTrailController` list/show/integrity; auth-audit retention command exists.
- **Issue:** No CSV/JSONL export endpoint; no retention/prune job for `admin_audit_events`; HMAC key tied to `app.key` without key-id versioning.
- **Acceptance Criteria:**
  - Export endpoint supports CSV/JSONL with filter limits and audit of export event.
  - Retention/prune job for admin audit with dry-run and min/max bounds.
  - HMAC key id/version stored so key rotation can preserve verification.
- **Test Plan:** Export permission, field whitelist, retention dry-run, key-id verification.
- **Recommended Fix:** Add export action/controller and `sso:prune-admin-audit-events`.

### BE-FR053-001 — RBAC Backend Strong, Least-Privilege Role Catalog Too Thin

- **Severity:** Medium
- **FR/UC:** FR-053 / UC-51, UC-52, UC-56, UC-57, UC-73
- **Area:** Admin RBAC
- **Evidence:** Middleware stack `AdminGuard → MFA → throttle → permission → freshness → MFA assurance`; `AdminPermission` has 17 permissions; seed locks admin/user.
- **Issue:** Only `admin` and `user` roles are seeded. Auditor/support/security-officer least-privilege roles needed for UC-57/UC-73 governance.
- **Acceptance Criteria:**
  - Role catalog includes auditor, support, client-manager, security-officer.
  - Permission matrix export/review endpoint available.
  - UI for role assignment exists.
- **Test Plan:** Role matrix tests and route denial/allowance per role.
- **Recommended Fix:** Add seeded least-privilege roles and admin UI for role management.

### BE-FR054-001 — Client Console Backend Complete; UI Missing Suspend/Activate/Scope Controls

- **Severity:** Medium
- **FR/UC:** FR-054 / UC-03, UC-04, UC-05, UC-60, UC-61
- **Area:** Admin client console
- **Evidence:** Backend supports stage/activate/disable/decommission, secret rotation, scope policy endpoints; FE `ClientManagementPage.vue` covers list/create/update/rotate/decommission.
- **Issue:** UI exposes decommission but not suspend/activate or scope policy controls; dual-secret grace window absent.
- **Acceptance Criteria:**
  - UI supports suspend/activate and scope editing.
  - Destructive actions confirm and show token revocation impact.
  - Optional dual-secret grace documented or implemented.
- **Test Plan:** FE page tests for suspend/activate/scope; backend cascade revoke tests.
- **Recommended Fix:** Add frontend controls backed by existing APIs.

### BE-FR055-001 — Security Policy Management Missing

- **Severity:** Critical
- **FR/UC:** FR-055 / UC-62, UC-68, UC-70
- **Area:** Security policy management
- **Evidence:** Scout grep found no `SecurityPolicy` model/controller/table; password policy hard-coded; MFA/session/lockout policy env-only in `config/sso.php`.
- **Issue:** Operators cannot version, audit, or roll out password/MFA/session/risk policies without deploy.
- **Acceptance Criteria:**
  - Security policy model/table with version, status, effective_at, actor, reason.
  - Admin endpoints/UI to propose/activate/rollback.
  - Runtime readers cache active policy safely.
  - Every change audited.
- **Test Plan:** Create draft, activate, rollback, runtime enforcement, audit.
- **Recommended Fix:** Implement `SecurityPolicy` aggregate and migrate env-only policies gradually.

### BE-FR056-001 — Internal Metrics Routes Lack In-App Auth Guard

- **Severity:** High
- **FR/UC:** FR-056 / UC-65, UC-75, UC-77, UC-78, UC-80, UC-82, UC-83
- **Area:** Monitoring/incident endpoints
- **Evidence:** `routes/oidc.php` exposes `/_internal/performance-metrics` and `/_internal/queue-metrics` without middleware; config has `internal_metrics_token_header`.
- **Issue:** Metrics rely on reverse-proxy ACL only; in-app token/header guard is absent.
- **Acceptance Criteria:**
  - Internal metrics require header token or mTLS-aware middleware.
  - Disabled unless configured.
  - Access attempts audited/rate-limited.
- **Test Plan:** Missing/wrong token 404/403; valid token returns metrics; prod config guard.
- **Recommended Fix:** Add `EnsureInternalMetricsToken` middleware using configured header.

### BE-FR057-001 — External IdP Discovery Services Exist but Runtime Config/Public Routes Missing

- **Severity:** High
- **FR/UC:** FR-057 / UC-81
- **Area:** External IdP discovery
- **Evidence:** `ExternalIdpDiscoveryService` enforces HTTPS, issuer and endpoints, cache/stale fallback. `config/sso.php` only declares `readiness_external_idp_snapshot_enabled`; services read undeclared `external_idp.*` keys.
- **Issue:** Ops cannot tune discovery/health/auth-state via env; end-user federation route is absent.
- **Acceptance Criteria:**
  - `sso.external_idp.*` config declared with env docs.
  - Public route starts external IdP auth using discovery metadata.
  - Discovery refresh failure has audit and stale policy.
- **Test Plan:** Config override tests; bad metadata; successful auth redirect route.
- **Recommended Fix:** Add config keys + public controller wiring for federation start.

### BE-FR058-001 — Federated Claims Mapping Lacks Preview and Missing-Email Strategy

- **Severity:** Medium
- **FR/UC:** FR-058 / UC-81
- **Area:** Federated login mapping
- **Evidence:** `ExternalIdpClaimsMapper` supports default/custom mapping, `email_verified` gate, sensitive-key stripping.
- **Issue:** If IdP lacks email, username fallback can become null; no admin dry-run/preview endpoint to validate mapping before enabling provider.
- **Acceptance Criteria:**
  - Mapping preview endpoint accepts sample claims and returns mapped result/errors.
  - Missing-email provider policy explicit.
  - Linking failures produce safe UX and audit.
- **Test Plan:** Sample claims with/without email; custom mapping preview; failed linking.
- **Recommended Fix:** Add `POST /admin/api/external-idps/{id}/mapping-preview` and non-email subject strategy.

### BE-FR059-001 — Federation Failover Has No Scheduled Probe/Circuit Breaker

- **Severity:** Medium
- **FR/UC:** FR-059 / UC-81, UC-82
- **Area:** External IdP failover/disable
- **Evidence:** `ExternalIdpFailoverPolicy` selects enabled healthy/unknown providers; redirect service blocks disabled/unhealthy; health probe service exists.
- **Issue:** No scheduler/queue registration found for health probes; no consecutive-failure circuit breaker. Stale discovery cache can mask flapping IdP.
- **Acceptance Criteria:**
  - Scheduled health probe updates provider state.
  - Consecutive failures trip unhealthy and trigger failover.
  - Manual disable immediately prevents selection.
- **Test Plan:** Probe failure counts, fallback provider selection, disabled provider rejection.
- **Recommended Fix:** Schedule `external-idp:probe-health` and add circuit-breaker counters.

### BE-FR060-001 — Error Taxonomy Enum Incomplete vs Wire Codes

- **Severity:** High
- **FR/UC:** FR-060 / UC-16, UC-17, UC-29, UC-30
- **Area:** OAuth/OIDC error taxonomy
- **Evidence:** `OidcErrorResponse` accepts strings; `SsoErrorCode` enum only covers a small set; wire codes include RFC6749/OIDC codes such as `invalid_client`, `invalid_grant`, `invalid_scope`, `consent_required`, `interaction_required`, `invalid_token`.
- **Issue:** Taxonomy is fragmented; retry/support/UX metadata cannot be derived centrally.
- **Acceptance Criteria:**
  - Central enum/registry covers RFC 6749 + OIDC Core + SSO-specific codes.
  - Each code has protocol status, safe copy key, retryability, support action.
  - Backend responders use registry.
- **Test Plan:** Snapshot all registry codes; every emitted code exists in registry; no arbitrary code emission.
- **Recommended Fix:** Add `OidcErrorCatalog` and migrate response helpers to it.

### BE-FR061-001 — Localization Hardcoded and Generic API Message Mapping Brittle

- **Severity:** Medium
- **FR/UC:** FR-061 / UC-18, UC-21, UC-74
- **Area:** User-facing error UX
- **Evidence:** FE `oauth-error-message.ts` maps OAuth/OIDC errors to id-ID safe copy; `api-error.ts` localizes known messages/status fallback; `src/locales/id.json` lacks OAuth taxonomy keys.
- **Issue:** OAuth copy is hard-coded in TS, not locale files; exact-string backend mapping can leak English/raw message for unmapped non-OAuth errors.
- **Acceptance Criteria:**
  - OAuth/API error copy lives in locale resources.
  - Unknown backend message never rendered directly.
  - User receives `error_ref`/request ID when support needed.
- **Test Plan:** Unknown `ApiError.message='SQLSTATE...'` → safe localized fallback; locale snapshot.
- **Recommended Fix:** Move copy into locale catalog and make `ApiError` presenter status/code-based only.

### BE-FR062-001 — Backend May Emit Raw Exception Text in `error_description`

- **Severity:** Critical
- **FR/UC:** FR-062 / UC-30, UC-63
- **Area:** Safe error messages
- **Evidence:** Scout identified raw exception text uses around `CreateAuthorizationRedirect.php`, `ProcessConsentDecision.php`, `AuthenticateLocalCredentials.php`, `CompletePendingOidcAuthorization.php`, `RevokeToken.php`; `bootstrap/app.php` exception handler is empty.
- **Issue:** Even if SSO FE masks errors, downstream clients may display `error_description`. Raw exception text can expose SQLSTATE/vendor paths/policy internals.
- **Acceptance Criteria:**
  - All OAuth `error_description` are safe catalog strings.
  - Global exception handler returns safe JSON/redirect for OIDC/API routes even with `APP_DEBUG=true` avoided in prod.
  - Technical reason logged only with hashed/redacted fields and `error_ref`.
- **Test Plan:** Force RuntimeException in authorize/token/consent/revoke → no stack/SQL/vendor in body/location.
- **Recommended Fix:** Add server-side `SafeErrorDescription` catalog/scrubber and global OIDC exception renderer.

### BE-FR063-001 — Correlation ID Exists but `error_ref` Not Returned/Propagated

- **Severity:** Medium
- **FR/UC:** FR-063 / UC-63, UC-82
- **Area:** Diagnostics/correlation
- **Evidence:** `EnsureRequestId` echoes `X-Request-Id`; FE `apiClient` sends UUID; `RecordSsoErrorAction` mints `SSOERR-*` and logs it.
- **Issue:** `error_ref` is not returned in HTTP body/header; request_id not consistently propagated to queued BCL jobs or outbound IdP calls.
- **Acceptance Criteria:**
  - Error responses include safe `request_id` and `error_ref` where applicable.
  - Async jobs preserve originating request_id.
  - Outbound IdP calls forward request_id.
  - FE displays copyable support reference for unexpected errors.
- **Test Plan:** API error response contains header/body refs; BCL job audit keeps same request_id; FE renders support ref.
- **Recommended Fix:** Extend `OidcErrorResponse`/API error presenters and job contexts with correlation metadata.

## 4. Frontend Findings

### FE-FR045-001 — Profile UI Needs Explicit Data-Minimization Contracts

- **Severity:** Low/Medium
- **FR/UC:** FR-045 / UC-34
- **Area:** Portal profile UI
- **Evidence:** Portal pages exist (`HomePage.vue`, profile/security/sessions pages).
- **Issue:** UI should be contract-tested to avoid accidental PII expansion and raw backend message display.
- **Acceptance Criteria:**
  - Profile cards render only approved fields.
  - Missing optional fields degrade gracefully.
  - Errors use central safe presenters.
- **Test Plan:** Component tests with extra server fields and unsafe messages.
- **Recommended Fix:** Add page contract tests and shared safe error presenter.

### FE-FR047-001 — Password Change/Reset UX Not Evidently Complete

- **Severity:** High
- **FR/UC:** FR-047 / UC-20, UC-36, UC-37, UC-71
- **Area:** Credential lifecycle UX
- **Evidence:** Login now handles `password_expired` CTA; Security/MFA pages exist.
- **Issue:** Dedicated self-service change/reset password UX is not clearly implemented end-to-end.
- **Acceptance Criteria:**
  - Change password form with current password + strength feedback.
  - Reset password request/confirm pages with safe errors.
  - Success informs session revocation/security notification.
- **Test Plan:** Form validation, 422 field errors, 419/429 safe copy, success navigation.
- **Recommended Fix:** Add password lifecycle services/composables/pages per design system.

### FE-FR049-001 — Data Subject Rights Portal UI Missing

- **Severity:** High
- **FR/UC:** FR-049 / UC-41, UC-42, UC-65
- **Area:** Privacy self-service
- **Evidence:** No data export/delete request page identified.
- **Issue:** Users cannot initiate personal data export/delete/anonymize workflow.
- **Acceptance Criteria:**
  - Privacy page offers export/delete request intake.
  - Clear confirmation, SLA copy, status tracking.
  - No legal/technical raw errors in UI.
- **Test Plan:** Request creation, pending status render, safe failure copy.
- **Recommended Fix:** Add Privacy/Data Requests page after backend workflow exists.

### FE-FR050-001 — Admin Dashboard UI Missing

- **Severity:** Medium
- **FR/UC:** FR-050 / UC-52
- **Area:** Admin UI
- **Evidence:** `services/sso-admin-vue` skeleton; `sso-frontend` admin page focuses client management.
- **Issue:** No dashboard cards for health, sessions, clients, audit, incidents.
- **Acceptance Criteria:**
  - Dashboard page uses design system cards and RBAC capabilities.
  - Safe loading/error states.
  - No hidden actions for missing permission.
- **Test Plan:** RBAC capability render tests; error state tests.
- **Recommended Fix:** Build dashboard after `GET /admin/api/dashboard/summary`.

### FE-FR051-001 — Admin User Lifecycle UI Missing

- **Severity:** Medium
- **FR/UC:** FR-051 / UC-50, UC-53, UC-54, UC-55
- **Area:** Admin user management UI
- **Evidence:** Backend endpoints exist; frontend user management page not identified.
- **Issue:** Admin cannot create/update/lock/reset user through shipped UI.
- **Acceptance Criteria:**
  - List/create/edit lifecycle UI gated by permissions.
  - Destructive actions require confirmation/reason.
  - Safe copy for 403/419/429/5xx.
- **Test Plan:** Page + dialog tests per action.
- **Recommended Fix:** Add `UserManagementPage.vue` + `admin-users.api.ts`.

### FE-FR052-001 — Admin Audit Export/Integrity UX Missing

- **Severity:** Medium
- **FR/UC:** FR-052 / UC-58, UC-59, UC-63, UC-79
- **Area:** Audit UI
- **Evidence:** Backend list/integrity exists; UI not identified.
- **Issue:** Admin/security officer cannot browse/export/integrity-check audit trail from UI.
- **Acceptance Criteria:**
  - Paginated audit log page with filters.
  - Integrity status panel.
  - Export controls only when backend export exists.
- **Test Plan:** Filter form, permission, safe error handling.
- **Recommended Fix:** Add audit UI after backend export route.

### FE-FR054-001 — Client Console Missing Suspend/Activate/Scope Management

- **Severity:** Medium
- **FR/UC:** FR-054 / UC-03, UC-04, UC-05, UC-60, UC-61
- **Area:** Client management UI
- **Evidence:** `ClientManagementPage.vue` covers list/create/update/rotate/decommission.
- **Issue:** Suspend/activate and scope policy editing are not exposed despite backend APIs.
- **Acceptance Criteria:**
  - Buttons/actions reflect client lifecycle status.
  - Scope editor uses known registry values.
  - Confirmation copy explains token revocation.
- **Test Plan:** Component tests for action visibility and payloads.
- **Recommended Fix:** Extend admin client page with suspend/activate/scope modals.

### FE-FR055-001 — Security Policy Console Missing

- **Severity:** High
- **FR/UC:** FR-055 / UC-62, UC-68, UC-70
- **Area:** Admin security policy UI
- **Evidence:** No backend policy model; no frontend page.
- **Issue:** Admin/security officer cannot version MFA/password/session/risk policies.
- **Acceptance Criteria:**
  - Policy view/edit/activate/rollback UI after backend exists.
  - Diff and effective date display.
  - Strong confirmation and audit reason.
- **Test Plan:** Draft/edit/activate UI tests.
- **Recommended Fix:** Implement after BE-FR055-001.

### FE-FR061-001 — Error Localization Should Move to Locale Catalog

- **Severity:** Medium
- **FR/UC:** FR-061 / UC-18, UC-21, UC-74
- **Area:** FE localization
- **Evidence:** `oauth-error-message.ts` contains hard-coded id-ID copy; `src/locales/id.json` lacks OAuth taxonomy.
- **Issue:** Locale switching and translation QA cannot cover OAuth copy centrally.
- **Acceptance Criteria:**
  - OAuth/API errors live in locale JSON.
  - Unknown codes fallback safely.
  - Tests snapshot message IDs not raw strings.
- **Test Plan:** Locale-key resolution tests; unknown message safe fallback.
- **Recommended Fix:** Introduce `errorMessageCatalog` backed by locale resources.

### FE-FR063-001 — Support Reference UX Missing

- **Severity:** Medium
- **FR/UC:** FR-063 / UC-63, UC-82
- **Area:** Diagnostics UX
- **Evidence:** FE sends `X-Request-ID`; callback/user errors show safe copy only.
- **Issue:** User/admin cannot copy `request_id`/`error_ref` for support because backend does not return it and UI has no component.
- **Acceptance Criteria:**
  - Error surfaces optionally show “Kode referensi” with request_id/error_ref.
  - References are safe, copyable, not stack traces.
- **Test Plan:** ApiError with request_id/error_ref renders support reference.
- **Recommended Fix:** Extend `ApiError` and alert components after backend includes refs.

## 5. Recommended Implementation Batches

### Batch 1 — Critical Protocol + Safe Error Guardrails

1. BE-FR036-001 — RFC 7662 Token Introspection endpoint.
2. BE-FR062-001 — Backend safe `error_description` + global OIDC/API exception renderer.
3. BE-FR032-001 — Refresh rotation transaction/row lock.
4. BE-FR033-001 — Refresh replay audit + security notification.
5. BE-FR052-001 — Admin audit export + retention.

### Batch 2 — Logout/Session Correctness

1. BE-FR040-001 — Persistent RP session registry.
2. BE-FR037-001 — Portal logout fans out to RP sessions.
3. BE-FR042-001 — Back-channel logout token replay store.
4. BE-FR043-001 — Front-channel logout fallback.
5. BE-FR044-001 — Logout idempotency/correlation propagation.
6. BE-FR039-001 — Race-safe SSO session idle expiry.

### Batch 3 — Governance/Admin/Policy

1. BE-FR055-001 — Security policy management aggregate.
2. BE-FR056-001 — Auth guard for internal metrics routes.
3. BE-FR053-001 — Least-privilege admin role catalog.
4. BE-FR050-001 — Admin dashboard summary endpoint.
5. FE-FR050-001 / FE-FR051-001 / FE-FR052-001 / FE-FR054-001 / FE-FR055-001 — Admin UI coverage.

### Batch 4 — Profile/Privacy/Self-Service

1. BE-FR049-001 — Data subject request workflow.
2. FE-FR049-001 — Privacy self-service UI.
3. BE-FR047-001 + FE-FR047-001 — Password change/reset lifecycle.
4. BE-FR046-001 — Email change verification.
5. BE-FR048-001 — Device/public-client connected apps visibility.
6. FE-FR045-001 — Profile minimization contracts.

### Batch 5 — Federation + Diagnostics Polish

1. BE-FR057-001 — External IdP config + public start/callback routes.
2. BE-FR058-001 — Mapping preview/missing-email strategy.
3. BE-FR059-001 — Scheduled health probe + circuit breaker.
4. BE-FR060-001 — Central OAuth/OIDC error catalog.
5. FE-FR061-001 — Locale-backed error catalog.
6. BE-FR063-001 + FE-FR063-001 — Error refs/support reference UX.

## 6. Definition of Done for Future Fixes

Setiap issue yang diimplementasikan harus memenuhi:

- TDD: test ditulis sebelum/bersamaan dengan implementasi.
- Backend: Controller/Action/Service separation, typed DTO/value object, no static mutable global state, Octane-safe.
- Frontend: Composition API, typed services, central `apiClient`, design system components, no direct raw `fetch` on shipped auth/admin paths.
- OAuth/OIDC: follow RFC 6749, OIDC Core, RFC 7009, RFC 7662, RFC 7519 where applicable.
- Error safety: no stack trace, SQLSTATE, vendor path, raw exception, secret/token, or user enumeration in UI/body/redirect query.
- Audit: security-sensitive action has request_id, actor/client/session identifiers, redacted context, and contract tests.
- Local validation minimal:
  - Backend: `./vendor/bin/pint`, relevant Pest tests, `composer analyse`.
  - Frontend: `npm run lint:eslint`, `npm run typecheck:web`, `npx vitest run`, `npm run build`.
- CI success before merge/deploy.
- Image build + VPS deploy only after code/audit commit is pushed and workflows pass.

## 7. Current Audit Status

- **Code changes:** documentation-only audit.
- **Implementation status:** backlog findings identified; fixes not implemented in this audit commit.
- **CI/build/deploy:** required because audit doc will be committed/pushed per user request; no application image behavior changes expected.

## 8. Traceability Summary

| FR | Status | Highest Gap |
| --- | --- | --- |
| FR-029 | Partial | Edge contract evidence for exchange failures/replay |
| FR-030 | Partial | ID token claim matrix evidence |
| FR-031 | Partial | Per-resource audience policy |
| FR-032 | Partial | Concurrent refresh rotation safety |
| FR-033 | Partial | Replay audit/security notification |
| FR-034 | Partial | Revocation client auth consistency |
| FR-035 | Partial | Passport fallback over-disclosure |
| FR-036 | Gap | Token introspection missing |
| FR-037 | Partial | Portal logout does not fan out |
| FR-038 | Partial | TTL bounds/versioning |
| FR-039 | Partial | Race-safe idle expiry |
| FR-040 | Partial | Cache-only RP session registry |
| FR-041 | Partial | `id_token_hint.sid` binding |
| FR-042 | Partial | Logout token replay protection |
| FR-043 | Gap | Front-channel logout fallback missing |
| FR-044 | Partial | Async correlation/idempotency |
| FR-045 | Partial | PII minimization evidence |
| FR-046 | Partial | Email verification workflow |
| FR-047 | Partial | Password self-service end-to-end |
| FR-048 | Partial | Device/public-client visibility |
| FR-049 | Gap | Data subject rights workflow |
| FR-050 | Partial | Dashboard summary/UI |
| FR-051 | Partial | Temporary lock/UI |
| FR-052 | Partial | Export + admin audit retention |
| FR-053 | Partial | Least-privilege role catalog |
| FR-054 | Partial | FE suspend/activate/scope controls |
| FR-055 | Gap | Security policy management missing |
| FR-056 | Partial | Internal metrics auth guard |
| FR-057 | Partial | Public federation route/config |
| FR-058 | Partial | Mapping preview/missing-email strategy |
| FR-059 | Partial | Health probe scheduler/circuit breaker |
| FR-060 | Partial | Central taxonomy incomplete |
| FR-061 | Partial | Locale catalog/support refs |
| FR-062 | Partial | Backend raw exception descriptions |
| FR-063 | Partial | Error ref propagation/UX |

## 9. Deep-Dive Hardening Addendum — Real Code Evidence Pass

Pass tambahan ini memvalidasi ulang audit terhadap kondisi aktual repo, bukan asumsi scout. Tujuan: mengunci temuan menjadi backlog implementasi yang lebih presisi, testable, dan sesuai standar TDD/kualitas frontend-backend.

### 9.1 Evidence Corrections / Refinements

| Area | Evidence Aktual | Dampak ke Audit |
| --- | --- | --- |
| FR-036 Introspection | `routes/oidc.php` tidak punya `/introspect`; `OidcCatalog` tidak mengiklankan `introspection_endpoint`; grep hanya menemukan komentar test. | BE-FR036-001 tetap **Critical** dan harus jadi prioritas Batch 1. |
| FR-034 Revocation | `RevokeToken::clientSecret()` hanya baca body `client_secret`; tidak memakai `TokenClientAuthenticationResolver`. | Finding diperkeras: endpoint revocation tidak konsisten dengan token endpoint yang sudah support Basic. |
| FR-032 Refresh rotation | `RefreshTokenStore::findActive()` tidak memakai `DB::transaction()` / `lockForUpdate`; `LocalTokenService::rotate()` issue token baru lalu revoke lama. | Gap race-condition valid; fix harus atomic row-lock/CAS. |
| FR-035 UserInfo | `BuildUserInfo::passportUserInfo()` memberi fallback `openid profile email` bila Passport token scopes kosong. | Over-disclosure risk valid; harus ditutup. |
| FR-037 Portal logout | `/api/auth/logout` memanggil `LogoutSsoSessionAction`; tidak route ke `PerformSingleSignOut`. | Portal logout hanya revoke SSO browser session; RP fan-out perlu implementasi. |
| FR-040 RP registry | `BackChannelSessionRegistry` menyimpan ke `ResilientCacheStore` key `oidc:backchannel-session:*`; tidak ada table/model RP session. | Persistent registry gap valid. |
| FR-041 RP logout | `PerformFrontChannelLogout` decode `id_token_hint` hanya untuk `aud/client_id`; tidak validasi hint `sid/sub` vs cookie session. | Binding gap valid. |
| FR-042 Logout token replay | `LocalLogoutTokenVerifier` validasi iss/aud/time/events/no nonce/sub-or-sid; tidak ada store `jti`. | Replay gap valid. |
| FR-043 Front-channel logout fallback | `OidcCatalog` hanya advertise BCL; `DownstreamClient` hanya punya `backchannelLogoutUri`, tidak `frontchannel_logout_uri`. | FCL fallback gap valid. |
| FR-052 Audit export/retention | `routes/admin.php` punya audit list/show/integrity; tidak export route; `routes/console.php` hanya prune authentication audit, bukan admin audit. | Export + admin audit retention tetap Critical. |
| FR-055 Security policy | Tidak ada `SecurityPolicy` model/service/controller; policy tersebar di env/config. | Gap valid. |
| FR-056 Internal metrics | `PerformanceMetricsController` dibatasi env local/testing/staging via Gate; `QueueMetricsController` via config boolean; tidak ada header token middleware walau config punya `internal_metrics_token_header`. | Severity turun dari raw-open menjadi **High**: prod guarded by env/config, tetapi missing in-app token guard. |
| FR-057 Federation | External IdP services ada, admin CRUD ada, tetapi `routes/*` tidak punya public external IdP start/callback; config `sso.external_idp.*` dipakai service namun tidak dideklarasikan di `config/sso.php`. | Gap valid. |
| FR-060/061 Error taxonomy | Backend punya `SsoErrorTemplateController` admin route; FE punya hardcoded `oauth-error-message.ts`; taxonomy belum satu sumber. | Finding harus menyebut template admin ada, tetapi OAuth code registry end-to-end belum canonical. |
| FR-047 Password self-service | Backend `ChangePasswordController` + FE `SecurityPage.vue` inline change-password ada; reset password self-service tidak ada; backend admin password reset token ada. | Finding direvisi: change password partial implemented; reset/forgot + session revoke/notification evidence gap. |
| FR-054 Client UI | Backend activate/disable/stage APIs ada; FE `ClientManagementPage.vue` ada tetapi harus diuji ulang untuk suspend/activate/scope coverage. | FE finding tetap Medium, perlu UI contract evidence sebelum implementasi. |

### 9.2 Hardening-Specific Acceptance Criteria Updates

#### H-BE-FR032 — Atomic Refresh Rotation

- **Target files:** `RefreshTokenStore`, `LocalTokenService`, `ExchangeToken`.
- **Hard requirement:** `findActive + issue replacement + revoke old token` harus satu transactional critical section.
- **Implementation principle:** jangan simpan lock/state di singleton service; Octane-safe; no static mutable cache.
- **Tests wajib:**
  - dua request refresh token sama → hanya satu sukses;
  - request kedua revoke family;
  - family expired → semua active family revoked;
  - replay audit emitted with hashed family id.

#### H-BE-FR034 — Revocation Auth Parity

- **Target files:** `RevokeToken`, `TokenClientAuthenticationResolver`.
- **Hard requirement:** `/revocation` dan `/oauth/revoke` harus support `client_secret_basic`, `client_secret_post`, public PKCE policy sesuai metadata.
- **Tests wajib:** Basic auth success, post auth success, conflicting Basic/body uses Basic precedence or rejects deterministically, invalid client still RFC7009 `200 {}` but audited.

#### H-BE-FR036 — RFC 7662 Introspection

- **Target files:** new action/controller/request, `routes/oidc.php`, `OidcCatalog`.
- **Hard requirement:** add `POST /introspect` and `/oauth2/introspect`; discovery advertises `introspection_endpoint` and auth methods.
- **Response policy:**
  - unknown/expired/revoked → `200 {"active": false}`;
  - active access token → include only RFC-safe fields (`active`, `iss`, `sub`, `aud`, `client_id`, `scope`, `exp`, `iat`, `sid`, `token_type`, `jti`) as policy allows;
  - never return raw decode exception.
- **Tests wajib:** active JWT, revoked JWT, expired JWT, unknown token, inactive client, invalid auth.

#### H-BE-FR037/040 — Persistent RP Session Registry + Portal Logout Fan-Out

- **Target files:** `BackChannelSessionRegistry`, new `OidcRpSession` model/migration, `LogoutSsoSessionAction` or new `PerformPortalSingleSignOutAction`.
- **Hard requirement:** cache cannot be source of truth for logout target list.
- **Portal logout:** `/api/auth/logout` must revoke SSO browser session + access JTIs + refresh tokens + RP session registry + dispatch BCL/FCL where available.
- **Tests wajib:** cache cleared but DB registry remains → logout still notifies RP; portal logout invalidates userinfo token; public client without refresh token visible/revoked.

#### H-BE-FR041/042/043/044 — Logout Protocol Completeness

- **RP-Initiated Logout:** validate `id_token_hint.sid/sub` against active cookie session when both exist.
- **Back-channel inbound:** persist `jti` until `exp`; duplicate token must be idempotent and audited as replay/duplicate.
- **Front-channel fallback:** add `frontchannel_logout_uri`, advertise `frontchannel_logout_supported`, render iframe logout page for non-BCL clients.
- **Correlation:** parent request id must be passed into logout jobs/audit events.

#### H-BE-FR052 — Admin Audit Export + Retention

- **Target files:** `AuditTrailController`, new export action, new prune command.
- **Hard requirement:** export must be permission-gated (`AUDIT_READ` or export-specific permission), bounded, filtered, redacted, audited.
- **Retention:** add `sso:prune-admin-audit-events --dry-run --limit=...`; schedule daily; never break HMAC integrity of retained chain without checkpoint/compaction design.
- **Tests wajib:** export CSV/JSONL whitelist, permission denial, export audit event, retention dry-run.

#### H-BE-FR055 — Security Policy Versioning

- **Hard requirement:** password/MFA/session/token/risk policy must be versioned and auditable before runtime mutable admin UI is enabled.
- **Safe rollout:** draft → validate → activate at `effective_at` → rollback. Runtime cache must include version id and short TTL/explicit invalidation.
- **Tests wajib:** active policy read, invalid draft rejection, activation audit, rollback audit, Octane no stale mutable static state.

#### H-BE-FR056 — Internal Metrics Guard

- **Refined risk:** route is not fully open in prod (`Gate::allowIf` / config boolean), but header-token config exists unused.
- **Hard requirement:** add middleware requiring configured token header for any `_internal/*` route when enabled; return 404/403 safely; audit invalid attempt.

#### H-BE-FR057/058/059 — Federation Public Flow

- **Existing:** admin External IdP CRUD + discovery/auth redirect/claims/health services.
- **Missing:** public start/callback routes, callback CSRF/state binding, scheduled health probe, declared config keys.
- **Hard requirement:** callback state must be server-side, single-use, expiring; external claims mapping must fail closed and never auto-link ambiguous accounts.

#### H-BE-FR060/061/062/063 — Safe Error System

- **Backend:** `SsoErrorTemplateController` exists; use it as evidence of template management, but OAuth/OIDC protocol `error_description` still needs central safe catalog.
- **Frontend:** `oauth-error-message.ts` safely maps OIDC callback, but copy is hardcoded TS not locale-backed.
- **Hard requirement:** raw exception message (`$exception->getMessage()`) must never be used as protocol `error_description` unless passed through safe catalog/scrubber.
- **Support ref:** include `X-Request-Id` and optional `error_ref` in safe response body/header; FE renders copyable support reference only, never trace.

### 9.3 Code Quality Constraints for Implementation Batches

These constraints are mandatory for all FR-029–FR-063 fixes:

- Backend controllers stay orchestration-only and **<100 lines**.
- New backend business logic goes to Actions/Services/Value Objects; no DB queries in controllers.
- No file >500 lines; existing large files touched by fixes (`CreateAuthorizationRedirect`, `RefreshTokenStore`, `ExchangeToken`) should be reduced opportunistically or not enlarged materially.
- Use FormRequest for new admin/write endpoints.
- All token/session mutations must be transaction-safe and Octane-safe.
- All audit context must hash token/code/secret values; never log plaintext token, client secret, recovery code, password, or upstream token.
- FE shipped auth/admin/profile paths must use `apiClient`, typed service modules, composables, and design-system components.
- FE must not render `ApiError.message` or URL `error_description` directly.
- Tests must be added before/with code per TDD standard; failing coverage evidence is acceptable only as audit backlog, not as “done”.

### 9.4 Revised Priority Queue

1. **P0:** BE-FR036, BE-FR062, BE-FR032, BE-FR033, BE-FR034.
2. **P1:** BE-FR040, BE-FR037, BE-FR042, BE-FR043, BE-FR052.
3. **P1:** BE-FR049, BE-FR055, BE-FR056, BE-FR057.
4. **P2:** BE-FR035, BE-FR038, BE-FR039, BE-FR041, BE-FR044, BE-FR047.
5. **P2/P3:** FE-FR049, FE-FR050, FE-FR051, FE-FR052, FE-FR054, FE-FR055, FE-FR061, FE-FR063.

### 9.5 Validation Plan for Hardened Fix Batches

Backend minimal per batch:

```bash
cd services/sso-backend
./vendor/bin/pint
php -d memory_limit=512M ./vendor/bin/pest --filter '<batch-specific-tests>'
composer analyse
```

Frontend minimal per FE batch:

```bash
cd services/sso-frontend
npm run lint:eslint
npm run typecheck:web
npx vitest run
npm run build
```

CI/deploy:

- Push to `main` only after local validation passes.
- Existing GHA must pass: `CI`, relevant service CI/CD, `Deploy Main to VPS`.
- For code batches that change runtime behavior, smoke auth/logout/token endpoints after deploy.
