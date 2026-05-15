# FR-001–FR-020 SSO Gap Audit

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

Audit ini meninjau implementasi SSO terhadap **FR-001 sampai FR-020** dan UC terkait. Fokus utama adalah discovery/JWKS, client management, local login, cookie/session security, consent, token exchange, brute-force protection, dan MFA readiness.

Tidak ada perubahan kode dalam audit ini. Dokumen ini menjadi backlog teknis terprioritaskan sebelum implementasi hardening berikutnya.

### Highest Priority Themes

1. **OIDC metadata harus konsisten dengan route aktual.**
2. **Metode autentikasi token endpoint yang diiklankan harus benar-benar didukung.**
3. **Proteksi brute-force harus konsisten di seluruh endpoint login.**
4. **OAuth token tidak boleh terekspos ke browser SPA.**
5. **ID Token harus diverifikasi secara kriptografis menggunakan JWKS.**
6. **Consent harus eksplisit untuk client/scope yang membutuhkan consent.**
7. **MFA flow harus selesai end-to-end, termasuk OIDC continuation dan recovery.**

## 2. Severity Legend

| Severity | Meaning | Expected Handling |
| --- | --- | --- |
| Critical | Berisiko security/spec breakage besar atau production login/token flow gagal. | Fix prioritas pertama, test-backed, deploy segera setelah validasi. |
| High | Risiko security/compliance signifikan, tetapi bisa dikerjakan setelah critical. | Masuk batch hardening awal. |
| Medium | Gap UX, policy, lifecycle, atau observability yang penting. | Jadwalkan setelah critical/high. |
| Low | Improvement / evidence gap / dokumentasi. | Backlog reguler. |

## 3. Backend Findings

### BE-FR001-001 — Discovery Metadata Endpoint Mismatch

- **Severity:** Critical
- **FR/UC:** FR-001, FR-005 / UC-01, UC-08
- **Area:** `services/sso-backend`
- **Evidence:** Discovery metadata mengiklankan endpoint seperti `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, sedangkan route aktual terlihat memiliki variasi `/authorize`, `/oauth2/authorize`, `/token`, `/oauth2/token`, dan `/oauth/revoke`.
- **Issue:** Client yang mengikuti discovery dapat memanggil endpoint yang tidak tersedia, terutama token endpoint `/oauth/token`.
- **Acceptance Criteria:**
  - Semua endpoint yang diiklankan discovery resolve ke route aktif.
  - Discovery metadata hanya mengiklankan canonical endpoint yang didukung.
  - Backward-compatible alias ditambahkan bila dibutuhkan oleh client existing.
- **Test Plan:**
  - Feature test discovery JSON shape.
  - Contract test setiap advertised endpoint memiliki route aktif.
  - Smoke test production untuk `/.well-known/openid-configuration`.
- **Recommended Fix:** Tambah route alias canonical `/oauth/token` atau update discovery metadata agar sesuai route aktual.

### BE-FR007-001 — `client_secret_basic` Advertised but Not Evidently Supported

- **Severity:** Critical
- **FR/UC:** FR-007 / UC-22, UC-30
- **Area:** Token endpoint
- **Evidence:** Discovery mengiklankan `client_secret_basic`, `client_secret_post`, dan `none`, tetapi token exchange terlihat membaca `client_secret` dari request body.
- **Issue:** Confidential clients yang menggunakan HTTP Basic Auth dapat gagal walau metadata menyatakan supported.
- **Acceptance Criteria:**
  - `client_secret_basic` supported sesuai RFC/OIDC.
  - `client_secret_post` tetap supported jika memang ingin dipertahankan.
  - Public clients hanya boleh memakai auth method `none` dengan PKCE.
- **Test Plan:**
  - Token exchange success dengan Basic Auth.
  - Token exchange success dengan `client_secret_post`.
  - Public PKCE client success tanpa secret.
  - Confidential client tanpa secret ditolak.
- **Recommended Fix:** Implement parser `Authorization: Basic base64(client_id:client_secret)` dan satu service resolver untuk token client authentication.

### BE-FR004-001 — `offline_access` Should Be Explicit Opt-In

- **Severity:** High
- **FR/UC:** FR-004, FR-011 / UC-07, UC-13
- **Area:** Scope registry and client policy
- **Evidence:** Scope default tampak mencakup `offline_access`.
- **Issue:** Refresh-token capability terlalu longgar jika diberikan sebagai default scope.
- **Acceptance Criteria:**
  - Default allowed scopes tidak mencakup `offline_access`.
  - Client harus explicitly allowed untuk menerima refresh token.
  - Request `offline_access` tanpa policy client ditolak atau diabaikan secara aman sesuai policy.
- **Test Plan:**
  - Client tanpa `offline_access` tidak mendapat refresh token.
  - Client dengan `offline_access` policy bisa mendapat refresh token bila requested.
  - Consent menampilkan `offline_access` secara jelas.
- **Recommended Fix:** Jadikan `offline_access` opt-in per client.

### BE-FR014-001 — Local Login Paths Are Not Consolidated

- **Severity:** Critical
- **FR/UC:** FR-014, FR-016 / UC-11, UC-18, UC-74
- **Area:** Local password login
- **Evidence:** Terdapat dua jalur login lokal: `/api/auth/login` dan `/connect/local-login`; proteksi terlihat tidak seragam.
- **Issue:** Salah satu endpoint login publik dapat menjadi bypass untuk throttle, disabled-account check, password expiry, audit, atau MFA checks.
- **Acceptance Criteria:**
  - Semua login password memakai verifier/service yang sama.
  - Disabled/locked account ditolak konsisten.
  - Password expiry diproses konsisten.
  - MFA requirement konsisten.
  - Audit event konsisten.
- **Test Plan:**
  - `/api/auth/login` lockout after threshold.
  - `/connect/local-login` lockout after threshold.
  - Disabled account ditolak di semua login path.
  - Expired password menghasilkan response aman dan konsisten.
- **Recommended Fix:** Extract shared local credential verification action/service yang stateless dan Octane-safe.

### BE-FR016-001 — Login Attempt Counter Is Non-Atomic

- **Severity:** High
- **FR/UC:** FR-016 / UC-11, UC-18, UC-74
- **Area:** Brute-force protection
- **Evidence:** Throttle terlihat memakai pola `Cache::get()` lalu `Cache::put()`.
- **Issue:** Concurrent failed attempts dapat undercount dan melewati lockout threshold.
- **Acceptance Criteria:**
  - Counter increment atomic.
  - TTL lockout jelas.
  - Response menyertakan retry guidance aman tanpa account enumeration.
- **Test Plan:**
  - Threshold attempts memicu lockout.
  - Lockout mengembalikan status/error code konsisten.
  - `Retry-After` tersedia untuk 429 bila dipakai.
- **Recommended Fix:** Gunakan Laravel RateLimiter atau Redis atomic increment dengan TTL.

### BE-FR011-001 — Consent May Be Auto-Granted During Local Login

- **Severity:** High
- **FR/UC:** FR-011 / UC-13, UC-21
- **Area:** Consent
- **Evidence:** Local login path terlihat dapat auto-grant consent untuk client tertentu.
- **Issue:** User tidak selalu memberi keputusan consent eksplisit untuk client/scope.
- **Acceptance Criteria:**
  - Non-first-party client yang membutuhkan consent diarahkan ke consent screen.
  - Approve dan deny menghasilkan outcome OIDC yang sesuai.
  - Consent decision diaudit.
- **Test Plan:**
  - New client requiring consent tidak langsung mendapat authorization code.
  - Approve consent menerbitkan code.
  - Deny consent mengembalikan OAuth error aman.
- **Recommended Fix:** Pisahkan login success dari consent decision; jangan auto-grant untuk non-first-party client.

### BE-FR011-002 — Consent Scope Source May Use Browser Session Context

- **Severity:** High
- **FR/UC:** FR-011 / UC-13
- **Area:** Consent scope evaluation
- **Evidence:** Consent decision terlihat dapat membaca scope dari browser session context, bukan selalu current authorization request.
- **Issue:** Existing SSO session bisa menyebabkan scope baru tidak dievaluasi benar.
- **Acceptance Criteria:**
  - Consent selalu dievaluasi terhadap current authorization request.
  - Existing session tidak menutupi elevated scope request.
- **Test Plan:**
  - User sudah login.
  - Client/request baru meminta scope tambahan.
  - Consent tetap diminta untuk scope tambahan.
- **Recommended Fix:** Gunakan authorization request context sebagai source of truth untuk scope consent.

### BE-FR013-001 — Nonce Enforcement Needs Alignment Across OIDC Login Paths

- **Severity:** Medium
- **FR/UC:** FR-013 / UC-10, UC-17, UC-22
- **Area:** Authorization Code + PKCE
- **Evidence:** PKCE terlihat enforced, namun local-login OIDC path perlu dipastikan juga mewajibkan `nonce` seperti authorize path.
- **Issue:** Nonce validation yang tidak konsisten melemahkan OIDC replay/mix-up mitigation.
- **Acceptance Criteria:**
  - OIDC auth request dan local login continuation sama-sama require nonce.
  - Missing nonce menghasilkan OIDC-safe error.
- **Test Plan:**
  - Missing nonce rejected.
  - Valid nonce round-trips into ID Token validation.
- **Recommended Fix:** Samakan validation rules local-login OIDC dengan authorize request validation.

### BE-FR009-001 — Static Confidential Client Secret Lifecycle Gap

- **Severity:** Medium
- **FR/UC:** FR-009 / UC-05, UC-61
- **Area:** Client secret lifecycle
- **Evidence:** Jika `secret_expires_at` unset, secret dapat dianggap tidak expired.
- **Issue:** Static confidential clients dapat memiliki secret permanen tanpa lifecycle enforcement.
- **Acceptance Criteria:**
  - Production confidential clients wajib punya lifecycle metadata.
  - Secret rotation expiry policy terdokumentasi dan tervalidasi.
- **Test Plan:**
  - Production config validation fails untuk confidential static client tanpa expiry.
  - Expired secret rejected.
  - Rotated secret works and old secret eventually rejected.
- **Recommended Fix:** Tambah production validation command/check untuk confidential client secret expiry.

### BE-FR012-001 — Suspend/Decommission Must Revoke Existing Tokens

- **Severity:** High
- **FR/UC:** FR-012 / UC-06, UC-09
- **Area:** Client lifecycle
- **Evidence:** Active client status dicek, tetapi token impact saat suspend/decommission perlu evidence kuat.
- **Issue:** Client yang disuspend bisa masih memakai token lama jika token tidak dicabut.
- **Acceptance Criteria:**
  - Suspend/decommission mencabut refresh token existing.
  - Access token lama tidak bisa dipakai untuk userinfo/introspection policy.
  - Audit event tercatat.
- **Test Plan:**
  - Suspended client tidak bisa authorize.
  - Suspended client tidak bisa refresh.
  - Userinfo/introspection menolak token client suspended.
- **Recommended Fix:** Hubungkan action suspend/decommission dengan token revocation store dan audit log.

### BE-FR018-001 — Admin MFA Grace Period May Be Too Permissive for Production

- **Severity:** High
- **FR/UC:** FR-018 / UC-51, UC-66, UC-73
- **Area:** Admin MFA policy
- **Evidence:** Admin MFA enrollment memiliki grace period default.
- **Issue:** Admin dapat mengakses privileged area tanpa MFA selama grace period.
- **Acceptance Criteria:**
  - Production default admin MFA grace period adalah 0, atau deploy guard memastikan policy aman.
  - Admin yang belum enroll MFA diarahkan ke enrollment sebelum privileged action.
- **Test Plan:**
  - Dengan grace 0, admin tanpa MFA ditolak dari privileged route.
  - Admin dengan MFA enrolled bisa lanjut.
- **Recommended Fix:** Set production `ADMIN_MFA_GRACE_PERIOD_HOURS=0` atau tambahkan deployment policy validation.

### BE-FR019-001 — MFA OIDC Continuation Needs End-to-End Completion

- **Severity:** Critical
- **FR/UC:** FR-019 / UC-19, UC-51, UC-67, UC-72, UC-73
- **Area:** MFA challenge and OIDC authorization continuation
- **Evidence:** MFA challenge dapat membuat SSO session, tetapi continuation ke authorization code issuance perlu dipastikan server-side dan aman.
- **Issue:** User MFA bisa stuck atau authorization context bisa tidak aman jika dipercayakan ke client-supplied context.
- **Acceptance Criteria:**
  - Pending OIDC authorization request disimpan server-side.
  - MFA success menerbitkan authorization code/redirect sesuai request awal.
  - Client-supplied `oidc_context` tidak dipercaya sebagai source of truth.
  - `amr/acr` tercatat sesuai hasil MFA.
- **Test Plan:**
  - Authorize request requires MFA.
  - Password valid returns MFA challenge.
  - TOTP valid resumes authorize flow and issues code.
  - Token contains expected assurance context.
- **Recommended Fix:** Implement/verify server-side pending OIDC context binding for MFA challenge.

### BE-FR020-001 — Lost-Factor MFA Recovery Workflow Is Incomplete

- **Severity:** High
- **FR/UC:** FR-020 / UC-66, UC-67, UC-69, UC-71, UC-76
- **Area:** MFA recovery
- **Evidence:** Recovery code regeneration exists, tetapi lost-factor flow untuk user yang terkunci belum jelas.
- **Issue:** User yang kehilangan MFA device bisa tidak memiliki recovery path yang aman dan terdokumentasi.
- **Acceptance Criteria:**
  - Ada support/admin reset workflow dengan verification, audit, dan notification.
  - User diwajibkan re-enroll MFA setelah reset.
  - Used recovery code invalidated.
- **Test Plan:**
  - Used recovery code cannot be reused.
  - Low-code notification triggered.
  - Admin reset writes audit event.
  - Forced re-enrollment after reset.
- **Recommended Fix:** Define and implement lost-factor recovery workflow.

## 4. Frontend Findings

### FE-FR013-001 — OAuth Tokens Are Exposed to Browser SPA

- **Severity:** Critical
- **FR/UC:** FR-013 / UC-10, UC-17, UC-22
- **Area:** OIDC callback
- **Evidence:** Callback flow receives `access_token`, `refresh_token`, and `id_token` in browser-side code.
- **Issue:** Refresh/access tokens become accessible to JavaScript runtime, contrary to BFF/session-cookie best practice.
- **Acceptance Criteria:**
  - Browser callback never receives raw OAuth tokens.
  - Authorization code exchange happens on same-origin BFF/server endpoint.
  - Browser receives only safe session/user/redirect result.
  - Session is stored via HttpOnly Secure cookie.
- **Test Plan:**
  - Unit test callback submits code/state to BFF only.
  - Contract test BFF sets HttpOnly session cookie.
  - No token fields in browser response type.
- **Recommended Fix:** Move token exchange out of SPA into BFF/session-cookie flow.

### FE-FR002-001 — ID Token Signature Verification Is Not Wired in Callback

- **Severity:** High
- **FR/UC:** FR-002, FR-013 / UC-02, UC-23
- **Area:** ID Token validation
- **Evidence:** `validateIdToken()` verifies signature only when `jwksUrl` is provided, but callback path does not pass JWKS URL.
- **Issue:** ID Token may be claim-validated without cryptographic signature verification.
- **Acceptance Criteria:**
  - Callback obtains validated discovery metadata.
  - Callback passes `jwks_uri` to ID token validation.
  - Invalid signature or unknown `kid` rejected.
- **Test Plan:**
  - Mock JWKS fetch invoked during callback.
  - Invalid signature rejected.
  - Wrong issuer/audience/nonce rejected.
- **Recommended Fix:** Wire discovery + JWKS verification into callback or BFF exchange validation.

### FE-FR005-001 — Token Endpoint Is Hardcoded Instead of Discovery-Based

- **Severity:** High
- **FR/UC:** FR-001, FR-005 / UC-01, UC-08, UC-10, UC-23
- **Area:** OIDC metadata usage
- **Evidence:** Callback resolves token endpoint using issuer string pattern rather than validated discovery metadata.
- **Issue:** Frontend can drift from backend-published OIDC metadata.
- **Acceptance Criteria:**
  - Authorization/token/JWKS endpoints come from validated discovery metadata.
  - Canonical issuer consistency is enforced.
- **Test Plan:**
  - Custom metadata token endpoint used.
  - Metadata issuer mismatch rejected.
  - Missing token endpoint rejected safely.
- **Recommended Fix:** Use discovery metadata as source of truth.

### FE-FR011-001 — Consent Page Is Display-Only

- **Severity:** High
- **FR/UC:** FR-011, FR-013 / UC-12, UC-13, UC-21
- **Area:** Consent UX
- **Evidence:** Consent page buttons are disabled and page notes display-only/future work.
- **Issue:** User cannot explicitly approve or deny consent.
- **Acceptance Criteria:**
  - Approve and deny controls enabled when a valid consent transaction exists.
  - Decision calls backend consent endpoint.
  - OAuth continuation/error redirect handled safely.
- **Test Plan:**
  - Approve path redirects to expected continuation.
  - Deny path emits safe OAuth error.
  - API errors show localized non-technical copy.
- **Recommended Fix:** Implement consent decision integration and tests.

### FE-FR004-001 — Scope Registry Is Limited

- **Severity:** Medium
- **FR/UC:** FR-004 / UC-07, UC-13
- **Area:** Scope labels and consent UX
- **Evidence:** Frontend only knows a small scope set: `openid`, `profile`, `email`, `offline_access`.
- **Issue:** Supported business/custom scopes may render as unknown.
- **Acceptance Criteria:**
  - Scope labels match backend registry.
  - Unknown scopes use safe generic fallback without misleading user.
- **Test Plan:**
  - All MVP scopes have labels/descriptions.
  - Unknown scope fallback is safe.
- **Recommended Fix:** Fetch scope registry from backend or maintain a shared contract.

### FE-FR006-001 — Admin Client Management UI Is Not Evident in Primary Router

- **Severity:** Medium
- **FR/UC:** FR-006–FR-012 / UC-03–UC-09, UC-60, UC-61
- **Area:** Admin UX
- **Evidence:** Primary router exposes auth and user portal routes, but not admin client management routes.
- **Issue:** If this frontend owns admin panel UX, client lifecycle management is incomplete.
- **Acceptance Criteria:**
  - Admin client-management UI location is documented.
  - If in this service, routes are role-protected and tested.
- **Test Plan:**
  - Admin can list/create/update client.
  - Admin can rotate secret.
  - Admin can suspend/decommission client.
  - Non-admin denied.
- **Recommended Fix:** Confirm admin UI ownership; add routed admin pages if missing.

### FE-FR016-001 — Login UX Lacks Structured Lockout/Rate-Limit States

- **Severity:** Medium
- **FR/UC:** FR-014, FR-016, FR-022 / UC-11, UC-18, UC-74
- **Area:** Login UX and safe errors
- **Evidence:** Generic error translation exists, but structured UI for 429/423/403 and retry countdown is not evident.
- **Issue:** Users may get unclear feedback, and raw backend errors could reappear if not mapped.
- **Acceptance Criteria:**
  - 429 shows localized safe retry message.
  - 423/403 disabled/locked messages are safe and non-enumerating.
  - No raw backend trace/message displayed.
- **Test Plan:**
  - Mock 429 with `Retry-After`.
  - Mock disabled/locked response.
  - Assert safe localized copy only.
- **Recommended Fix:** Add structured handling in login composable/UI.

### FE-FR018-001 — MFA Portal UI Not Active

- **Severity:** Medium
- **FR/UC:** FR-018, FR-020 / UC-66, UC-67, UC-69, UC-71, UC-76
- **Area:** Security page / MFA settings
- **Evidence:** Security page states MFA management is future release while API/composables exist.
- **Issue:** Users cannot enroll/regenerate/manage MFA from portal.
- **Acceptance Criteria:**
  - User can view MFA status.
  - User can enroll TOTP.
  - User can verify TOTP.
  - User can view/download recovery codes once.
  - User can regenerate/remove MFA with password confirmation.
- **Test Plan:**
  - Not enrolled state.
  - Enrollment QR/secret state.
  - Verification success/failure.
  - Recovery code display and regenerate.
  - Safe error copy.
- **Recommended Fix:** Wire existing MFA API/composable into `SecurityPage` or dedicated MFA settings page.

### FE-FR019-001 — MFA Challenge Uses Direct Fetch Instead of Central API Client

- **Severity:** Medium
- **FR/UC:** FR-019 / UC-19, UC-67
- **Area:** MFA challenge verification
- **Evidence:** MFA challenge composable uses direct `fetch`, bypassing central `apiClient`.
- **Issue:** Request lacks central behavior such as XSRF, request ID, timeout, typed errors, and localization.
- **Acceptance Criteria:**
  - MFA challenge verify uses `apiClient`.
  - Typed `ApiError` used consistently.
  - CSRF/429/expired challenge errors map to safe user-facing copy.
- **Test Plan:**
  - Verify request includes central headers/credentials behavior.
  - Expired challenge handled safely.
  - 419/429 handled safely.
- **Recommended Fix:** Move MFA challenge verify into `mfa.api.ts` and update composable.

## 5. Recommended Implementation Batches

### Batch 1 — Security & Spec Correctness

1. BE-FR001-001 — Discovery endpoint consistency.
2. BE-FR007-001 — `client_secret_basic` support.
3. BE-FR014-001 / BE-FR016-001 — Consistent brute-force protection.
4. FE-FR002-001 / FE-FR005-001 — Discovery/JWKS based ID Token validation.
5. FE-FR013-001 — Move token exchange to BFF/session-cookie flow.

### Batch 2 — Consent & Scope Governance

1. BE-FR004-001 — `offline_access` opt-in.
2. BE-FR011-001 — No auto-grant consent for non-first-party clients.
3. BE-FR011-002 — Use current authorization request scope.
4. FE-FR011-001 — Enable consent approve/deny UI.
5. FE-FR004-001 — Scope registry alignment.

### Batch 3 — MFA Completion

1. BE-FR019-001 — MFA OIDC continuation.
2. BE-FR018-001 — Admin MFA production policy.
3. BE-FR020-001 — Lost-factor recovery workflow.
4. FE-FR018-001 — MFA management UI.
5. FE-FR019-001 — Centralize MFA challenge API.

### Batch 4 — Lifecycle Hardening

1. BE-FR012-001 — Suspend/decommission revokes tokens.
2. BE-FR009-001 — Static client secret lifecycle validation.
3. FE-FR016-001 — Structured login lockout/rate-limit UX.

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

- **Code changes:** none
- **Commit:** documentation-only audit pending commit if accepted
- **CI/build/deploy:** not required until this audit file is committed or implementation begins
