# FR-021–FR-028 SSO Gap Audit

**Tanggal:** 2026-05-15  
**Scope:** `services/sso-backend`, `services/sso-frontend`  
**Requirement Source:** `docs/requirements/fr_uc_sso_practical_reader.md`  
**Standards:**

- `services/sso-backend/TDD-standart-prod.md`
- `services/sso-backend/standart-quality-code.md`
- `services/sso-frontend/TDD-standart-prod.md`
- `services/sso-frontend/standart-quality-code.md`
- `services/sso-frontend/design.md`

## 1. Executive Summary

Audit ini meninjau implementasi SSO terhadap **FR-021 sampai FR-028** dan UC terkait:

- FR-021 — Step-up Authentication
- FR-022 — Lock/Disable Akun & Lifecycle Credential
- FR-023 — Validasi Authorization Request
- FR-024 — Penerbitan Authorization Code
- FR-025 — Enforcement Scope & Claim
- FR-026 — Pencatatan & Pencabutan Consent
- FR-027 — Penanganan Prompt Login/Consent
- FR-028 — Error Response Authorization yang Standar

Fokus utama: `acr_values`, `max_age`, prompt OIDC, lifecycle akun pada active SSO session, validasi scope/authorization request, code issuance dari stale context, consent revocation, dan safe OAuth/OIDC error UX.

### Highest Priority Themes

1. **Active SSO session harus re-check user lifecycle sebelum menerbitkan authorization code.**
2. **Local login / MFA / consent continuation tidak boleh downgrade invalid scope menjadi `openid`.**
3. **`prompt=none` harus mengikuti OIDC semantics: no UI, return `login_required` atau `consent_required`.**
4. **Authorization code issuance harus revalidasi client/redirect saat consent/MFA continuation.**
5. **Frontend tidak boleh render raw `error_description` dari query atau raw backend error.**
6. **Consent API harus memakai central `apiClient`, bukan direct `fetch`.**
7. **Step-up params `acr_values` dan `max_age` perlu first-class support FE/BE.**

## 2. Severity Legend

| Severity | Meaning | Expected Handling |
| --- | --- | --- |
| Critical | Risiko security/spec breakage besar atau production auth flow bypass. | Fix prioritas pertama, test-backed, deploy segera setelah validasi. |
| High | Risiko security/compliance signifikan. | Masuk batch hardening awal. |
| Medium | Gap UX, policy, lifecycle, observability, atau scalability penting. | Jadwalkan setelah critical/high. |
| Low | Improvement/evidence/documentation gap. | Backlog reguler. |

## 3. Backend Findings

### BE-FR022-001 — Active SSO Session Does Not Evidently Re-check Account Lifecycle

- **Severity:** Critical
- **FR/UC:** FR-022 / UC-18, UC-20, UC-50, UC-55, UC-76
- **Area:** Authorization session reuse
- **Evidence:** Password login checks disabled/local/password-expired in `VerifyLocalPasswordLoginAction`, but `/authorize` active browser session reuse in `CreateAuthorizationRedirect` issues code from `SsoBrowserSession` context without evident current user lifecycle re-check.
- **Issue:** Admin disable/lock/password-expiry may not prevent an already-authenticated SSO browser session from getting new authorization codes.
- **Acceptance Criteria:**
  - Before code issuance from active SSO session, backend reloads current user by subject.
  - Disabled/locked/local-disabled/password-expired users cannot reuse SSO session.
  - Safe OIDC/user-facing error only; no account enumeration.
  - Audit event recorded.
- **Test Plan:**
  - Active SSO session + `disabled_at` → no code.
  - Active SSO session + `local_account_enabled=false` → no code.
  - Active SSO session + expired password → force credential lifecycle flow, no code.
  - Admin lock/disable prevents future session reuse.
- **Recommended Fix:** Add stateless lifecycle guard before `localRedirect()` / code issuance.

### BE-FR023-001 — Local Login / MFA Continuation Downgrades Invalid Scope to `openid`

- **Severity:** High
- **FR/UC:** FR-023, FR-025, FR-028 / UC-10, UC-13, UC-16, UC-17, UC-23, UC-24
- **Area:** Authorization request validation
- **Evidence:** `/authorize` rejects invalid scope, but local OIDC login and MFA continuation catch scope validation failure and fallback to `openid`.
- **Issue:** Invalid or unauthorized requested scopes are silently changed, causing inconsistent OAuth semantics and misleading consent/claim behavior.
- **Acceptance Criteria:**
  - Invalid scope returns standard `invalid_scope`.
  - Scope policy changes during MFA/consent continuation fail safe, no code.
  - No silent fallback to broader or different scope.
- **Test Plan:**
  - `/connect/local-login` unknown scope → `invalid_scope`.
  - Scope not allowed for client → `invalid_scope`.
  - MFA continuation after client scope policy change → safe failure, no code.
  - Consent continuation invalid scope → safe failure, no code.
- **Recommended Fix:** Replace fallback with explicit OIDC-safe error path.

### BE-FR027-001 — `prompt=none` Consent Semantics Not Standard

- **Severity:** High
- **FR/UC:** FR-027, FR-028 / UC-15, UC-21
- **Area:** OIDC prompt handling
- **Evidence:** `prompt=none` returns `login_required` when no session, but no explicit `consent_required` flow found for authenticated user missing consent. Active session can be routed to consent UI.
- **Issue:** OIDC Core requires no UI with `prompt=none`; if consent is needed, return `consent_required` or `interaction_required` to redirect URI.
- **Acceptance Criteria:**
  - No session + `prompt=none` → `login_required` redirect.
  - Active session + consent missing + `prompt=none` → `consent_required` redirect, no UI.
  - Active session + prior consent + `prompt=none` → code.
  - Invalid prompt combinations rejected.
- **Test Plan:**
  - Request-level feature tests for the four cases above.
- **Recommended Fix:** Handle prompt-none consent branch before consent UI redirect.

### BE-FR024-001 — Consent Allow Can Issue Code from Stale Client Context

- **Severity:** High
- **FR/UC:** FR-024 / UC-12, UC-22
- **Area:** Authorization code issuance
- **Evidence:** MFA continuation revalidates client/redirect before issuing code, but consent allow path appears to issue code from stored `AuthRequestStore` payload.
- **Issue:** If client is suspended/decommissioned or redirect URI changed while consent screen is open, stale context may still issue code.
- **Acceptance Criteria:**
  - Before consent allow code issuance, re-resolve client and redirect URI.
  - Suspended/decommissioned/redirect-rotated clients cannot receive code.
  - Safe OAuth error returned.
- **Test Plan:**
  - Open consent → suspend client → approve → no code.
  - Open consent → remove redirect URI → approve → no code.
  - Audit rejection event recorded.
- **Recommended Fix:** Revalidate client binding at consent decision execution time.

### BE-FR021-001 — Step-up `acr_values` Not Fully Enforced Through Local Login

- **Severity:** High
- **FR/UC:** FR-021 / UC-14, UC-19, UC-67, UC-68, UC-72
- **Area:** Step-up authentication
- **Evidence:** `/authorize` checks current browser session ACR, but local login path issues password ACR unless MFA happens due to user enrollment. Requested `acr_values` is not evidently carried/enforced through local-login/MFA context.
- **Issue:** RP requesting `urn:sso:loa:mfa` can be downgraded to password-only after local login, especially when user lacks MFA.
- **Acceptance Criteria:**
  - `acr_values=urn:sso:loa:mfa` requires MFA challenge, not password-only success.
  - User without MFA gets safe step-up unavailable/enrollment-required outcome.
  - MFA continuation issues code with `acr=urn:sso:loa:mfa` and `amr=['pwd','mfa']`.
- **Test Plan:**
  - Password-level session + MFA ACR request → no direct code.
  - Local login for MFA ACR user without MFA → no password-only code.
  - Local login for enrolled user → MFA challenge bound to requested ACR.
- **Recommended Fix:** Persist requested `acr_values` in auth request context and enforce in local/MFA continuation.

### BE-FR021-002 — `max_age` Needs End-to-End Evidence

- **Severity:** Medium
- **FR/UC:** FR-021, FR-027 / UC-14
- **Area:** Force re-authentication
- **Evidence:** `max_age=0` prevents active session reuse, but requested `max_age` is not evidently carried into local login continuation/test evidence.
- **Issue:** Fresh auth-time evidence can drift without contract tests.
- **Acceptance Criteria:**
  - `max_age=0` always forces re-auth.
  - Fresh local login sets new `auth_time` close to current time.
  - Non-numeric `max_age` is rejected or ignored consistently by documented policy.
- **Test Plan:** Feature tests for active session + `max_age=0`, token `auth_time`, invalid max_age.
- **Recommended Fix:** Add explicit max-age validation/evidence tests; persist where needed.

### BE-FR025-001 — Refresh Downscope Fallback Can Preserve Disallowed Scopes

- **Severity:** Medium
- **FR/UC:** FR-025 / UC-07, UC-13, UC-23, UC-24
- **Area:** Scope enforcement
- **Evidence:** Refresh token downscope logic can return original scopes if intersection with currently allowed scopes is empty.
- **Issue:** Removing scopes from client policy may not take effect for refresh tokens.
- **Acceptance Criteria:**
  - Refresh token scopes are intersected with current allowed scopes.
  - Empty intersection rejects refresh, not preserves old scopes.
  - UserInfo reflects downscoped token.
- **Test Plan:**
  - `openid profile` refresh after client allowed scope becomes `openid` → returns only `openid`.
  - Empty allowed intersection → refresh rejected.
- **Recommended Fix:** Replace original-scope fallback with reject/no-scope failure.

### BE-FR026-001 — Consent Revocation Exists, but Needs Pagination and Contract Evidence

- **Severity:** Medium
- **FR/UC:** FR-026 / UC-12, UC-13, UC-21, UC-39
- **Area:** Consent lifecycle
- **Evidence:** Consent grant/revoke and connected-app revoke exist; consent listing uses unbounded query.
- **Issue:** Functional revocation is present, but scalability and end-to-end evidence need hardening.
- **Acceptance Criteria:**
  - Connected apps/consents listing is paginated or bounded.
  - Revoking consent requires consent again on next authorization.
  - Token impact policy is tested.
- **Test Plan:**
  - Revoke connected app → next authorize requires consent.
  - Refresh/userinfo with revoked app token rejected per policy.
  - Large consent set does not perform unbounded list.
- **Recommended Fix:** Add pagination/bounds and revocation contract tests.

### BE-FR028-001 — Authorization Error Shape Is Not Fully Consistent

- **Severity:** Medium
- **FR/UC:** FR-028 / UC-15, UC-16, UC-17, UC-21
- **Area:** OAuth/OIDC errors
- **Evidence:** `OidcErrorResponse` helper exists, but consent/show and local-login errors use mixed `message` / `error_description` shapes.
- **Issue:** Protocol errors vary and can weaken client interoperability / safe UX guarantees.
- **Acceptance Criteria:**
  - OIDC protocol errors consistently include `error`, `error_description`.
  - `Cache-Control: no-store`, `Pragma: no-cache` applied.
  - Valid redirect errors include state where required.
  - No stack trace/raw exception in FR-023..FR-028 error cases.
- **Test Plan:** Contract tests across `/authorize`, `/connect/local-login`, `/connect/consent`.
- **Recommended Fix:** Route all protocol errors through one OIDC error responder.

## 4. Frontend Findings

### FE-FR028-001 — OIDC Callback Renders Raw `error_description`

- **Severity:** High
- **FR/UC:** FR-028 / UC-15, UC-16, UC-17, UC-21
- **Area:** Callback UX
- **Evidence:** `useOidcCallback` reads `query.error_description` and `CallbackPage` displays it.
- **Issue:** Query-controlled or backend technical error text can appear in UI. This violates no raw UI tech error policy.
- **Acceptance Criteria:**
  - Raw `error_description` is never rendered.
  - Known OAuth errors map to localized safe copy.
  - Unknown errors use generic safe copy.
- **Test Plan:**
  - `invalid_request&error_description=SQLSTATE...` → safe copy only.
  - `access_denied`, `login_required`, `consent_required` each map safely.
- **Recommended Fix:** Add OAuth error translation helper in callback composable.

### FE-FR026-001 — Consent API Uses Direct `fetch`

- **Severity:** High
- **FR/UC:** FR-026 / UC-12, UC-13, UC-21, UC-39
- **Area:** Consent service
- **Evidence:** `services/sso-frontend/src/services/consent.api.ts` uses raw `fetch` for load/decision.
- **Issue:** Bypasses central `apiClient`: XSRF, request ID, timeout, typed `ApiError`, localization.
- **Acceptance Criteria:**
  - Consent load and decision use `apiClient`.
  - `ApiError` handled consistently.
  - 419/429/backend errors map to safe user copy.
- **Test Plan:**
  - Service tests prove `apiClient.get/post` usage.
  - Consent page tests 419/429/raw backend message safety.
- **Recommended Fix:** Move to `apiClient.get/post`; update page error mapping/tests.

### FE-FR022-001 — Password-Expired Credential Lifecycle UX Missing

- **Severity:** High
- **FR/UC:** FR-022 / UC-18, UC-20, UC-37, UC-50, UC-55, UC-76
- **Area:** Login UX
- **Evidence:** Login composable handles 429, 423/403 lock/disabled, 401, MFA re-enroll; no primary `password_expired` handling found.
- **Issue:** Backend `password_expired` can become generic or unsafe UX; force-change flow not evident.
- **Acceptance Criteria:**
  - `password_expired` maps to safe localized copy.
  - User gets clear next action to change/reset password.
  - No raw backend details displayed.
- **Test Plan:**
  - `ApiError(403, raw, 'password_expired')` → safe copy.
  - Login page displays next-action CTA only when safe.
- **Recommended Fix:** Add structured password-expired branch and route/CTA to credential lifecycle flow.

### FE-FR021-001 — Authorize Helper Does Not Support `acr_values` / `max_age`

- **Severity:** Medium
- **FR/UC:** FR-021 / UC-14, UC-19, UC-67, UC-68, UC-72
- **Area:** OIDC authorize helper
- **Evidence:** `useOidcAuthorize` supports `prompt` only.
- **Issue:** Frontend cannot initiate step-up/force-reauth with first-class params.
- **Acceptance Criteria:**
  - `acr_values` and `max_age` supported in typed authorize options.
  - Tests cover inclusion and validation.
  - No token/secret stored in localStorage.
- **Test Plan:** `useOidcAuthorize.spec.ts` for `acr_values`, `max_age=0`, prompt combinations.
- **Recommended Fix:** Extend typed options and URL builder.

### FE-FR023-001 — Authorization Endpoint Helper Still Can Drift from Discovery

- **Severity:** Medium
- **FR/UC:** FR-023 / UC-10, UC-16, UC-17
- **Area:** OIDC authorize start
- **Evidence:** `useOidcAuthorize` builds from config endpoint, defaulting from issuer path; discovery validation exists elsewhere.
- **Issue:** FE auth-start can drift from backend discovery canonical endpoint.
- **Acceptance Criteria:**
  - Auth-start uses validated discovery `authorization_endpoint` or a cached validated metadata source.
  - Issuer mismatch/missing endpoint fails safely.
- **Test Plan:** Tests for custom discovery endpoint and mismatch failure.
- **Recommended Fix:** Reuse validated discovery loader for authorize URL.

### FE-FR026-002 — Connected Apps Revocation UI Can Render Raw Error Message

- **Severity:** Medium
- **FR/UC:** FR-026 / UC-39
- **Area:** Connected apps revoke UX
- **Evidence:** `ConnectedAppsPage` renders `revoke.error.value.message` directly.
- **Issue:** Raw `ApiError.message` may contain backend technical details.
- **Acceptance Criteria:**
  - Revocation failures show localized safe copy.
  - 419/429 map explicitly.
  - Raw backend text not rendered.
- **Test Plan:** Mock `ApiError(500, 'SQLSTATE stack trace user@example.com')` → safe copy only.
- **Recommended Fix:** Add safe error mapper or use shared API error presentation helper.

### FE-FR027-001 — Prompt Paths Under-Tested in Frontend

- **Severity:** Low/Medium
- **FR/UC:** FR-027 / UC-14, UC-15
- **Area:** Prompt handling UX
- **Evidence:** `prompt` type allows `none`, `login`, `consent`, `select_account`; router only special-cases `prompt=login`.
- **Issue:** Backend owns semantics, but FE lacks tests for prompt=consent/none error UX.
- **Acceptance Criteria:**
  - Tests prove all prompt values included when requested.
  - `login_required` / `consent_required` callback errors map to safe copy.
- **Test Plan:** `useOidcAuthorize` + `useOidcCallback` tests.
- **Recommended Fix:** Add test coverage alongside FE-FR028/021 fixes.

### FE-FR028-002 — Legacy `src/web` Auth/Consent May Bypass Standards

- **Severity:** Medium if shipped; Low if dead code
- **FR/UC:** FR-027, FR-028 / UC-15, UC-16, UC-17, UC-21
- **Area:** Legacy web entry
- **Evidence:** `src/web/views/LoginView.vue` and `ConsentView.vue` use direct fetch; legacy router exists.
- **Issue:** If still built/reachable, old paths bypass central API client and safe error rules.
- **Acceptance Criteria:**
  - Confirm legacy `src/web` is dead/excluded, or migrate to central services.
  - No direct fetch remains in shipped auth/consent paths.
- **Test Plan:** Build-entry ownership test or removal/migration tests.
- **Recommended Fix:** Remove dead legacy app or refactor to same standards.

## 5. Recommended Implementation Batches

### Batch 1 — Critical Protocol/Security Guardrails

1. BE-FR022-001 — Active SSO session lifecycle re-check.
2. BE-FR023-001 — No invalid-scope downgrade in local/MFA/consent continuation.
3. FE-FR028-001 — Safe OIDC callback error presentation.
4. FE-FR026-001 — Consent API via central `apiClient`.

### Batch 2 — OIDC Prompt / Code Issuance Semantics

1. BE-FR027-001 — `prompt=none` → `consent_required` semantics.
2. BE-FR024-001 — Revalidate client/redirect before consent code issuance.
3. BE-FR028-001 — Standardize OIDC error response shape.
4. FE-FR027-001 — Prompt path tests and safe UX.

### Batch 3 — Step-up Authentication Completion

1. BE-FR021-001 — Enforce `acr_values` through local login/MFA continuation.
2. BE-FR021-002 — `max_age` end-to-end evidence.
3. FE-FR021-001 — Add `acr_values`/`max_age` typed authorize support.

### Batch 4 — Lifecycle / Consent / Scope Polish

1. FE-FR022-001 — Password-expired UX and next action.
2. BE-FR025-001 — Refresh downscope reject/no stale fallback.
3. BE-FR026-001 — Consent list pagination + revocation evidence.
4. FE-FR026-002 — Connected-app revoke safe errors.
5. FE-FR023-001 — Discovery-canonical authorize helper.
6. FE-FR028-002 — Remove or migrate legacy `src/web` auth/consent.

## 6. Definition of Done for Future Fixes

Setiap issue yang diimplementasikan harus memenuhi:

- Test ditulis sebelum/bersamaan dengan implementasi sesuai TDD standard.
- Backend mengikuti Controller/Action/Service/Repository separation dan aman untuk Octane.
- Frontend mengikuti Composition API, typed services, centralized API client, dan design system.
- Tidak ada token/secret/raw technical error yang muncul di UI atau console logging.
- Local validation minimal:
  - Backend: syntax, relevant Pest tests, Pint/PHPStan sesuai ketersediaan project.
  - Frontend: relevant Vitest, `typecheck:web`, ESLint, build.
- CI GitHub Actions success.
- Image baru dibangun dan deploy ke VPS hanya setelah kode berubah dan CI relevan pass.

## 7. Current Audit Status

- **Code changes:** documentation-only audit.
- **Implementation status:** backlog findings identified; fixes not yet implemented in this audit commit.
- **CI/build/deploy:** required only if this audit is committed/pushed or when implementation begins.
