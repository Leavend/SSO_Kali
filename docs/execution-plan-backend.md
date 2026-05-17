# Execution Plan — `services/sso-backend`

**Tanggal:** 2026-05-17
**Sumber Temuan:** Audit kepatuhan FR/UC vs `docs/requirements/fr_uc_sso_practical_reader.md`
**Standar yang berlaku:**

- `services/sso-backend/standart-quality-code.md`
- `services/sso-backend/TDD-standart-prod.md`

**Audit baseline:** Hasil audit live-codebase 2026-05-17 (lihat `docs/audits/fr-001-fr-063-gap-audit.md`).
**Catatan scope:** Dokumen ini hanya untuk service backend Laravel. Item frontend ada di `docs/execution-plan-frontend.md`.

**Execution status (2026-05-17):** BE-T01, BE-T02, BE-T03, BE-T04, BE-T05, BE-T06 implemented/verified. Validation: Pint PASS, PHPStan PASS, full Pest PASS (`1128 passed`), coverage PASS (`83.0%` with PCOV, minimum `80%`), Docker image build PASS (`sso-backend:hardening-local`).

---

## 1. Ringkasan Eksekutif

Backend OIDC kernel (discovery, JWKS, authorize, token exchange, refresh rotation/reuse detection, revocation, introspection, back-channel logout, RBAC + step-up + MFA assurance) sudah produksi dengan contract test. Sisa kerja terbagi tiga blok:

| Blok | Sifat | Risiko jika tidak dikerjakan |
| --- | --- | --- |
| A. Compliance hardening (DSR) | Fungsional + audit | Tidak bisa membuktikan pemenuhan hak data subject end-to-end (FR-049 / UC-41, UC-42, UC-65) |
| B. Self-service profile (FR-046) | Fungsional | User tidak bisa mengubah email/phone dengan verifikasi via Portal |
| C. Quality cleanup | Standar `§2.1` | File size > 500 baris di dua action/service kritis |

Tidak ada finding 🔴 CRITICAL pada protokol OIDC. Prioritas tertinggi adalah Blok A (DSR) karena menyangkut compliance evidence pack.

---

## 2. Daftar Task

| Task ID | FR/UC | Severity | Effort | Sprint |
| --- | --- | --- | --- | --- |
| BE-T01 | FR-049 / UC-41, UC-42, UC-65 | 🟠 HIGH | M | Sprint 1 |
| BE-T02 | FR-046 / UC-35 | 🟡 MEDIUM | M | Sprint 3 |
| BE-T03 | FR-023 (quality) | 🔵 LOW | S | Sprint 2 |
| BE-T04 | FR-032 (quality) | 🔵 LOW | S | Sprint 2 |
| BE-T05 | Doc hygiene | 🔵 LOW | S | Sprint 2 |
| BE-T06 | FR-031 follow-on | 🔵 LOW | S | Sprint 3 |

Estimasi total: ~2 sprint backend (S=0.5d, M=2d, L=5d acuan).

---

## 3. Detail Task

### BE-T01 — DSR delete/anonymize hardening (FR-049)

**Tujuan:** Menutup gap fulfillment data subject request agar memenuhi compliance evidence pack.

**Konteks saat ini:**

- `app/Services/DataSubject/DataSubjectFulfillmentService.php` sudah punya `deleteSubject()` dan `anonymizeSubject()` (171 baris).
- `app/Jobs/FulfillApprovedDataSubjectRequestJob.php` sudah queued.
- `app/Http/Controllers/DataSubject/DataSubjectRequestController.php` sudah pakai FormRequest + service presentation.
- Tetapi: belum ada legal-hold guard, belum ada dry-run vs execute artifact diff, belum ada contract test yang memetakan tabel PII secara eksplisit.

**Acceptance Criteria:**

1. Sebelum `deleteSubject()` / `anonymizeSubject()` dijalankan, action menanyakan policy `legal-hold` (kategori baru di `SecurityPolicy`). Jika hold aktif untuk subject tersebut, request masuk status `on_hold` dengan audit `data_subject_request.on_hold`.
2. `FulfillDataSubjectRequestAction::execute(... $dryRun = true)` menghasilkan artifact `{summary, table_counts, would_delete: true, hash}` yang disimpan ke `dsr_fulfillment_artifacts` (atau setara) dan **tidak** mengubah data.
3. `dryRun = false` mensyaratkan artifact dry-run yang valid (hash cocok) berusia ≤ 24 jam. Jika tidak ada → `RuntimeException('DSR execute requires recent dry-run artifact.')`.
4. Setiap tabel PII ter-cover oleh delete atau anonymize:
   - `users`, `external_subject_links`, `mfa_credentials`, `mfa_recovery_codes`, `user_consents`, `oidc_rp_sessions`, `oauth_tokens`, `oauth_refresh_tokens`, `password_reset_tokens`.
   - Daftar tabel diambil dari `config/dsr.php` (sumber kebenaran), bukan hardcoded di service.
5. Contract test baru memastikan: setiap tabel di `config/dsr.php['pii_tables']` diketahui oleh `deleteSubject()` ATAU `anonymizeSubject()` (assertion `expect($coveredTables)->toEqualCanonicalizing(config('dsr.pii_tables'))`).
6. Audit event `fulfill_data_subject_request` mencantumkan `dry_run`, `artifact_id`, `legal_hold_status`, `pii_table_counts`.

**File yang diubah:**

- `app/Services/DataSubject/DataSubjectFulfillmentService.php`
- `app/Actions/DataSubject/FulfillDataSubjectRequestAction.php`
- `app/Models/DataSubjectRequest.php` (tambah relasi artifact)
- `app/Services/Security/SecurityPolicyService.php` (kategori `legal_hold`)
- `config/dsr.php` (baru)
- Migration: `dsr_fulfillment_artifacts` (id, request_id, type, payload, hash, dry_run, created_at, expires_at)

**Test wajib (PestPHP 4 + describe block):**

- `tests/Feature/DataSubject/DsrLegalHoldGateContractTest.php`
- `tests/Feature/DataSubject/DsrDryRunArtifactRequiredContractTest.php`
- `tests/Feature/DataSubject/DsrPiiTableCoverageContractTest.php`
- `tests/Unit/DataSubject/DataSubjectFulfillmentServiceTest.php` (diperluas)

**Standar referensi:**

- `TDD-standart-prod.md §6.1` — critical flow 100% coverage.
- `standart-quality-code.md §3.2` — Action stateless, file < 80 baris (perlu split `FulfillDataSubjectRequestAction` jika melewati batas).
- `standart-quality-code.md §5.4` — authorization via Policy/Gate.

**Effort:** M (≈ 2 hari engineer).

---

### BE-T02 — Self-service email/phone change dengan verifikasi (FR-046)

**Tujuan:** Memenuhi UC-35 "Ubah Profil" dengan flow verifikasi standar.

**Konteks saat ini:**

- `routes/web.php` `PATCH /api/profile` hanya menerima nama (`UpdateProfilePortalAction`).
- Tidak ada flow `request-email-change` / `confirm-email-change`.
- Admin sync (`SyncManagedUserProfileAction`) sudah benar mengosongkan flag verifikasi.

**Acceptance Criteria:**

1. Endpoint baru:
   - `POST /api/profile/email-change` — body `{new_email}`, mengirim email verifikasi ke alamat baru, simpan request token (Argon2id hashed) ke `profile_change_requests` dengan TTL 30 menit.
   - `POST /api/profile/email-change/confirm` — body `{token}`, jika cocok dan belum expired → update `email`, set `email_verified_at = null`, kirim notifikasi keamanan ke alamat lama (FR-071 future-friendly), audit `profile.email_changed`.
   - `POST /api/profile/phone-change` + confirm dengan OTP 6-digit (gunakan `app/Services/Mfa/TotpService.php`-style hashing, bukan plaintext).
2. Rate limit baru: `profile-change-request` 5/menit/user.
3. Notifikasi keamanan: `Notifications/EmailChangeRequestedNotification.php` ke email lama; `EmailChangedNotification` setelah konfirmasi.
4. Form Request dedicated:
   - `RequestEmailChangeRequest`
   - `ConfirmEmailChangeRequest`
   - `RequestPhoneChangeRequest`
   - `ConfirmPhoneChangeRequest`

**File yang ditambah/diubah:**

- `app/Http/Controllers/Resource/ProfileChangeController.php` (baru, thin)
- `app/Actions/Profile/RequestEmailChangeAction.php`
- `app/Actions/Profile/ConfirmEmailChangeAction.php`
- `app/Actions/Profile/RequestPhoneChangeAction.php`
- `app/Actions/Profile/ConfirmPhoneChangeAction.php`
- `app/Notifications/EmailChangeRequestedNotification.php`
- `app/Notifications/EmailChangedNotification.php`
- Migration: `profile_change_requests` (id, user_id, type, target_value, token_hash, otp_hash, expires_at, consumed_at, ip, user_agent)

**Test wajib:**

- `tests/Feature/Profile/EmailChangeLifecycleContractTest.php`
- `tests/Feature/Profile/PhoneChangeLifecycleContractTest.php`
- `tests/Unit/Actions/Profile/ConfirmEmailChangeActionTest.php` (token replay protection, TTL expiry, mismatch)

**Standar referensi:**

- `standart-quality-code.md §5.2` — semua input via Form Request.
- `standart-quality-code.md §3.3` — Service/Action stateless, tidak akses `$request` di Service.
- `TDD-standart-prod.md Phase 3.3` — token confirmation tidak boleh di-log plaintext.

**Effort:** M (≈ 2 hari engineer).

---

### BE-T03 — Refactor `CreateAuthorizationRedirect.php` ≤ 500 baris

**Tujuan:** Memenuhi `standart-quality-code.md §2.1` (max 500 baris/file) dan `§3.2` (Action ≤ 80 baris).

**Konteks saat ini:** File berukuran 639 baris dan menjalankan 4 sub-flow (PKCE validation, scope resolution, upstream callback bridging, error redirect building).

**Acceptance Criteria:**

1. Action utama tetap di `CreateAuthorizationRedirect` dengan ukuran ≤ 200 baris (target ideal `< 80` per method).
2. Sub-flow di-extract ke service/action lain yang sudah ada atau baru:
   - `app/Services/Oidc/PkceRequestValidator.php` (baru) — validasi `code_challenge`, `code_challenge_method`.
   - `app/Services/Oidc/AuthorizationRequestNormalizer.php` (baru) — parsing `prompt`, `acr_values`, `max_age`, scope.
   - `app/Actions/Oidc/BridgeUpstreamAuthorization.php` (baru) — saat external IdP aktif.
3. Tidak ada penurunan coverage. Semua test existing harus tetap hijau.
4. Public API `handle(Request $request): JsonResponse|RedirectResponse` tidak berubah → tidak ada breaking change untuk caller.

**Test wajib:**

- Tidak ada test baru bersifat behavior. Tambahkan unit test per service/action yang di-extract:
  - `tests/Unit/Oidc/PkceRequestValidatorTest.php`
  - `tests/Unit/Oidc/AuthorizationRequestNormalizerTest.php`
  - `tests/Unit/Oidc/BridgeUpstreamAuthorizationTest.php`

**Effort:** S (≈ 0.5–1 hari).

---

### BE-T04 — Refactor `RefreshTokenStore.php` ≤ 500 baris

**Tujuan:** Sama dengan BE-T03; file 542 baris.

**Acceptance Criteria:**

1. Service utama menyimpan: `rotateAtomic`, `findActive`, `revokeFamily`, `resolveWithReuseSignal`.
2. Helper di-extract:
   - `app/Services/Oidc/RefreshTokenFamily.php` — pure data carrier untuk `family_id`, generation, lineage.
   - `app/Services/Oidc/RefreshTokenReuseSignal.php` — value object `{record, reuse, family_id, token_id}`.
3. Method `private function …` yang panjang dipecah agar `≤ 20 baris` (`§2.2`).
4. Existing tests `tests/Feature/Oidc/AtomicRefreshRotationContractTest.php`, `RefreshTokenRotationReplayContractTest.php`, `RefreshTokenReuseAuditContractTest.php` tetap hijau.

**Test tambahan:** Unit test per VO baru.

**Effort:** S.

---

### BE-T05 — Update status flag pada `fr_uc_sso_practical_reader.md`

**Tujuan:** Konsistensi dokumen requirement vs realita repo. Tiga FR sudah shipped tetapi masih dilabeli `Gap/Partial/Planned`.

**Acceptance Criteria:**

1. Update kolom **Status** di `docs/requirements/fr_uc_sso_practical_reader.md`:
   - FR-036 `✗ Gap` → `✓ Implemented` (cite `IntrospectionContractTest`).
   - FR-042 `◐ Partial` → `✓ Implemented` (cite `BackChannelLogoutPartialFailureContractTest`, `LocalLogoutTokenVerifierReplayTest`).
   - FR-057 `◻ Planned` → `✓ Implemented` (cite `ExternalIdpPublicCallbackRouteContractTest`).
   - FR-058 `◻ Planned` → `✓ Implemented` (cite `ExternalIdpClaimsMappingContractTest`).
   - FR-059 `◻ Planned` → `✓ Implemented` (cite `ExternalIdpCircuitBreakerContractTest`).
2. Tambah footer "Last verified by repo audit: 2026-05-17 — see `docs/audits/fr-001-fr-063-gap-audit.md`".

**Effort:** S (≈ 1 jam).

---

### BE-T06 — Multi-resource access token audience plan (FR-031 follow-on)

**Tujuan:** Mendokumentasikan rencana migrasi dari single global `aud` ke per-resource audience.

**Acceptance Criteria:**

1. ADR baru: `docs/adr/0xxx-multi-resource-audience-policy.md` berisi:
   - Status quo (`config/sso.php` resource_audience tunggal).
   - Tradeoff: per-client audience vs per-resource audience vs scope-driven.
   - Migration step: introducing `resources` table, `client_resources` pivot, `aud` claim resolution.
   - Backward compatibility: mempertahankan `sso-resource-api` sebagai default audience minimal 1 release.
2. Belum diimplementasikan; hanya dokumen + RFC.

**Effort:** S.

---

## 4. Sequencing & Dependencies

```
Sprint 1
  └─ BE-T01 (DSR hardening)

Sprint 2
  ├─ BE-T03 (refactor authorization redirect)
  ├─ BE-T04 (refactor refresh store)
  └─ BE-T05 (doc status flag sync)

Sprint 3
  ├─ BE-T02 (profile email/phone change)
  └─ BE-T06 (multi-aud ADR)
```

BE-T01 tidak bergantung pada task lain. BE-T03/BE-T04 sebaiknya selesai sebelum BE-T02 agar action baru tidak menambah ukuran file yang sudah over-budget.

---

## 5. Validation Contract per Task

Setiap task wajib lulus pipeline berikut sebelum dianggap selesai:

```bash
cd services/sso-backend

# 1. Format & static analysis
vendor/bin/pint --test
vendor/bin/phpstan analyse --memory-limit=512M

# 2. Test suite scoped
vendor/bin/pest --filter=<NamaContractTest>

# 3. Full test sebelum merge
vendor/bin/pest

# 4. Coverage gate (kritikal)
vendor/bin/pest --coverage --min=80
```

Per audit closure rule (`docs/audits/fr-001-fr-063-gap-audit.md §9`): finding hanya boleh ditutup dengan **production code + contract test**. Tidak boleh menutup dengan dokumen saja.

---

## 6. Definition of Done — Backend

Sebuah task BE-Txx hanya boleh ditandai DONE jika seluruh checkpoint berikut PASS:

- [ ] Semua acceptance criteria di Section 3 task tersebut terpenuhi.
- [ ] PHASE 1 architecture check (`TDD-standart-prod.md`) PASS — controller thin, action stateless, service tidak return HTTP, repository tidak SELECT \*.
- [ ] PHASE 2 code quality check PASS — file ≤ 500 baris, function ≤ 20 baris, nested ≤ 3, cyclomatic ≤ 10.
- [ ] PHASE 3 security check PASS — Form Request, no `$request->all()`, no token/secret di log, parameter binding.
- [ ] PHASE 4 performance check PASS — no N+1, paginated, cache untuk hot query.
- [ ] PHASE 5 Octane safety PASS — tidak ada mutable property, action tetap stateless.
- [ ] PHASE 6 test coverage PASS — minimal 1 unit test per Action baru, minimal 1 feature test per endpoint baru, kritikal flow 100%.
- [ ] PHASE 7 API contract — response sukses `{success, message, data}`; error `{success: false, message, errors}`.
- [ ] PHASE 8 logging — structured array context dengan `correlation_id`.
- [ ] PHASE 9 commit-ready — Pint, PHPStan, Pest, coverage ≥ 80%; commit message Conventional Commits (`feat(dsr): …`).

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| BE-T01 dry-run artifact bocor data sensitif | Artifact disimpan dengan `payload_encrypted` (Laravel encrypter) + audit access log. |
| BE-T02 rate limit memungkinkan email enumeration via `email-change` | Response 200 generic regardless of duplicate email; kirim notifikasi ke email lama saja. |
| BE-T03/BE-T04 regression PKCE / refresh rotation | Sebelum merge: jalankan full `tests/Feature/Oidc` dan `tests/Feature/OAuth`. |
| BE-T05 doc edit memicu CI build deploy | Lihat audit §9 closure rule — perubahan docs-only tetap memicu deploy via `deploy-main.yml`. Pastikan branching policy dipatuhi. |

---

## 8. Lampiran — Mapping ke Audit Findings

| Task ID | Audit reference | Severity asal |
| --- | --- | --- |
| BE-T01 | LIVE-005 (`fr-001-fr-063-gap-audit.md`) | Medium/High |
| BE-T02 | FR-046 audit entry (Section 2 audit ringkas) | Medium |
| BE-T03 | Cross-cutting §4.1 | Low |
| BE-T04 | Cross-cutting §4.1 | Low |
| BE-T05 | Cross-cutting §4.3 | Low |
| BE-T06 | FR-031 audit entry | Low |
