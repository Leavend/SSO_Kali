# Execution Plan — `services/sso-frontend` (Portal SSO)

**Tanggal:** 2026-05-17
**Sumber Temuan:** Audit kepatuhan FR/UC vs `docs/requirements/fr_uc_sso_practical_reader.md`
**Standar yang berlaku:**

- `services/sso-frontend/standart-quality-code.md`
- `services/sso-frontend/TDD-standart-prod.md`
- `services/sso-frontend/design.md`

**Audit baseline:** Hasil audit live-codebase 2026-05-17 (lihat `docs/audits/fr-001-fr-063-gap-audit.md`).
**Catatan scope:** Dokumen ini hanya untuk Portal SSO (`services/sso-frontend`). Admin Portal SSO out of scope. Item backend ada di `docs/execution-plan-backend.md`.

---

## 1. Ringkasan Eksekutif

Portal SSO sudah benar dibatasi pada auth, consent, MFA, profile, security, sessions, connected apps, dan privacy/DSR. PKCE, JWKS validation, error taxonomy, dan rate-limit sudah lengkap.

Sisa kerja didominasi satu keputusan arsitektur tunggal yang ber-cabang ke beberapa FR keamanan, plus dua kategori hygiene:

| Blok | Sifat | Risiko jika tidak dikerjakan |
| --- | --- | --- |
| A. BFF token posture (FR-013/017/037) | 🟠 HIGH (security) | Cookie `__Host-sso-portal-session` membawa bundle access/refresh/id token terenkripsi — bearer-equivalent secret di browser |
| B. Self-service email/phone change UI (FR-046) | 🟡 MEDIUM | User tidak punya UI untuk ubah email/phone dengan verifikasi |
| C. TDD parity & quality cleanup | 🔵 LOW | Atomic-design test gap, console.log bebas berkeliaran, file handler 468 baris |

Tidak ada finding 🔴 CRITICAL kalau definisi "browser tidak boleh baca token" dipenuhi via HttpOnly cookie. Namun, audit charter menyebut posture BFF opaque-only sebagai standar — jadi BFF cookie token bundle tetap diperlakukan HIGH.

---

## 2. Daftar Task

| Task ID | FR/UC | Severity | Effort | Sprint |
| --- | --- | --- | --- | --- |
| FE-T01 | FR-013 / FR-017 / FR-037 | 🟠 HIGH | L | Sprint 1 |
| FE-T02 | FR-046 / UC-35 (UI) | 🟡 MEDIUM | M | Sprint 3 |
| FE-T03 | TDD parity (atoms, contract test) | 🔵 LOW | S | Sprint 2 |
| FE-T04 | Cross-cutting (no console.log) | 🔵 LOW | S | Sprint 2 |
| FE-T05 | `auth-handlers.ts` decomposition | 🔵 LOW | S | Sprint 2 |
| FE-T06 | Stale audit/E2E cleanup | 🔵 LOW | S | Sprint 2 |
| FE-T07 | Safe error display consistency | 🔵 LOW | S | Sprint 3 |

Estimasi total: ≈ 1 sprint penuh + tail-end audit cleanup.

---

## 3. Detail Task

### FE-T01 — Pindah BFF dari encrypted token cookie ke opaque session ID + server-side store

**Tujuan:** Tutup posture risk yang muncul di FR-013, FR-017, dan FR-037 sekaligus. Browser hanya boleh menyimpan opaque session handle; token OAuth disimpan server-side dengan TTL, rotation, dan eviction saat logout.

**Konteks saat ini (verified):**

- `src/server/session.ts` baris 22–24 dan 107–119: `PortalSession` menyimpan `accessToken`, `idToken`, `refreshToken` di-enkripsi ke cookie `__Host-sso-portal-session`.
- Cookie HttpOnly + Secure + SameSite + `__Host-` prefix sudah benar (`src/__tests__/cookies.test.ts`).
- Browser JS tidak bisa baca token (HttpOnly), tetapi cookie itu sendiri = bearer-equivalent.
- BFF aktif di `src/server/index.ts`, route registry di `src/server/proxy-routes.ts`, auth handler di `src/server/auth-handlers.ts` (468 baris).

**Acceptance Criteria:**

1. `__Host-sso-portal-session` hanya berisi `{ session_id: string }` opaque (UUID v4 atau ULID), encrypted at rest. Tidak ada token OAuth di payload cookie.
2. Token OAuth disimpan di server-side store dengan TTL absolut + idle:
   - Backend Redis (preferensi) atau in-memory selama dev. Driver harus di-abstraksi `PortalSessionStore` interface.
   - TTL absolut = `idTokenExpiry`; idle TTL = 30 menit (dapat dikonfigurasi via env `SSO_PORTAL_SESSION_IDLE_MINUTES`).
3. Setiap request masuk:
   - `cookieStore.read()` → `session_id` opaque.
   - `PortalSessionStore.fetch(session_id)` → `{ accessToken, idToken, refreshToken, sub, expiresAt }`.
   - Jika store miss atau expired → `clearSession()` + redirect ke login.
4. Logout server-side:
   - `PortalSessionStore.evict(session_id)` dipanggil sebelum cookie di-clear.
   - Backend `/connect/logout` tetap dipanggil untuk RP-initiated logout.
5. Test contract baru (lokasi `src/server/__tests__/`):
   - `opaque-session-payload.spec.ts` — mendekripsi cookie payload, assert tidak ada key `accessToken`/`idToken`/`refreshToken`.
   - `session-store-eviction.spec.ts` — setelah logout, store.fetch return null; cookie cleared.
   - `session-store-ttl.spec.ts` — idle timeout dan absolute TTL menendang user.
   - `stolen-handle-rejected.spec.ts` — jika `session_id` masih valid format tapi sudah dievict (logout di tab lain), request berikutnya 401.
6. Compatibility:
   - Endpoint frontend (`/api/auth/session`, `/api/auth/login`, `/api/profile/*`) tidak berubah.
   - Tidak ada perubahan pada `services/sso-backend`. Server-side store hidup di proses Node frontend.

**File utama yang diubah:**

- `src/server/session.ts` — refactor jadi thin wrapper di atas `PortalSessionStore`.
- `src/server/session-store.ts` — saat ini interface ada (`opaque-session-store.spec.ts` sudah ada). Pastikan implementasi Redis production-ready, bukan in-memory only.
- `src/server/auth-handlers.ts` — adapt ke store baru.
- `src/server/cookies.ts` — payload schema baru (`{ session_id: string }`).
- `src/server/config.ts` — env baru `SSO_PORTAL_SESSION_STORE_DRIVER`, `SSO_PORTAL_SESSION_REDIS_URL`, `SSO_PORTAL_SESSION_IDLE_MINUTES`.

**Standar referensi:**

- `services/sso-frontend/standart-quality-code.md` (sensitive data section) — tidak boleh menyimpan token di tempat yang dapat dijadikan bearer oleh attacker.
- `TDD-standart-prod.md Phase 0.8` — token tidak masuk localStorage / tidak diekspos ke JS.
- `design.md §2` Trust posture — "form autentikasi terasa aman dalam tiga detik".

**Migration plan:**

1. Tambah store + flag `SSO_PORTAL_SESSION_OPAQUE=true` (default false).
2. Saat flag aktif, BFF menulis cookie baru + populate store.
3. Saat flag mati, behaviour lama. Memungkinkan rollback cepat.
4. Setelah satu siklus deploy stabil → flag default `true` → hapus path lama.

**Test coverage gate:** seluruh test di `src/server/__tests__/` harus PASS, plus 4 spec baru di atas.

**Effort:** L (≈ 5 hari engineer, termasuk Redis wiring + observability).

---

### FE-T02 — Self-service email/phone change UI (FR-046)

**Tujuan:** Memetakan endpoint baru BE-T02 ke UI Portal yang sesuai standar `design.md`.

**Konteks saat ini:**

- `src/pages/portal/ProfilePage.vue` (160 baris) hanya menampilkan + edit `displayName`.
- Belum ada `EmailChangeForm` / `PhoneChangeForm` molecule.

**Acceptance Criteria (depends on BE-T02):**

1. Section baru di `ProfilePage.vue` "Email & nomor telepon":
   - Tampil email aktif dengan badge `Terverifikasi` / `Belum diverifikasi` (pakai `AppBadge`).
   - Tombol "Ubah email" → membuka `EmailChangeDialog` (Reka UI `DialogRoot`).
   - Tombol "Ubah nomor telepon" → membuka `PhoneChangeDialog`.
2. Flow `EmailChangeDialog`:
   - Step 1: input email baru + password konfirmasi (sesuai pattern `SecurityPasswordForm.vue`).
   - Step 2: pesan "Cek inbox email baru untuk tautan verifikasi" + countdown 30 menit.
   - Step 3 (route `/profile/email-change/confirm?token=…`): konfirmasi sukses + audit ditampilkan.
3. Flow `PhoneChangeDialog`:
   - Step 1: input nomor + password.
   - Step 2: input OTP 6-digit (reuse `MfaTotpInput.vue`-style atom `AppOtpInput.vue` baru jika perlu).
4. Composable baru:
   - `composables/useEmailChange.ts` (≤ 150 baris) — state machine `idle → requesting → awaiting_confirmation → confirmed / failed`.
   - `composables/usePhoneChange.ts` — analog.
5. Service baru:
   - `services/profile-change.api.ts` (`requestEmailChange`, `confirmEmailChange`, `requestPhoneChange`, `confirmPhoneChange`).
6. Error handling pakai `apiClient` + `ApiError` taxonomy (`src/lib/api/api-error.ts`). Tidak ada `console.log`.

**Test wajib (Vitest + describe block):**

- `src/composables/__tests__/useEmailChange.spec.ts`
- `src/composables/__tests__/usePhoneChange.spec.ts`
- `src/services/__tests__/profile-change.api.spec.ts`
- `src/pages/portal/__tests__/ProfilePage.email-change.spec.ts`
- (Optional) `e2e/profile-email-change.spec.ts` jika playwright config sudah aktif.

**Standar referensi:**

- `design.md §3.1` typography & §3.2 color — tidak boleh ada warna baru di luar palette.
- `design.md` accessibility — Dialog harus pakai Reka UI primitives (sudah dipakai di `MfaRemoveDialog`).
- `standart-quality-code.md §6.2` — Vue component max 300 baris, business logic di composable.
- `TDD-standart-prod.md Phase 1.1–1.3` — Atomic design level discipline.

**Effort:** M (≈ 2–3 hari, blocking on BE-T02).

---

### FE-T03 — Atomic-design test parity untuk atoms

**Tujuan:** Penuhi `TDD-standart-prod.md Phase 1.3` — setiap atom punya minimal 1 spec.

**Konteks saat ini (verified):**

- `src/components/atoms/__tests__/` hanya berisi `AppBrandMark.spec.ts` dan `ThemeToggleButton.spec.ts`.
- Direktori `src/components/ui/*` (shadcn-style) belum ter-cover.
- `src/components/molecules/`, `mfa/`, `organisms/` sudah lebih lengkap.

**Acceptance Criteria:**

1. Tambah smoke spec untuk setiap atom yang dipakai oleh organism atau page:
   - `src/components/ui/button/__tests__/Button.spec.ts`
   - `src/components/ui/input/__tests__/Input.spec.ts`
   - `src/components/ui/label/__tests__/Label.spec.ts`
   - `src/components/ui/badge/__tests__/Badge.spec.ts`
   - `src/components/ui/skeleton/__tests__/Skeleton.spec.ts`
   - `src/components/ui/alert-dialog/__tests__/AlertDialog.spec.ts`
   - `src/components/ui/separator/__tests__/Separator.spec.ts`
2. Smoke test minimal:
   - Render dengan default props.
   - Render dengan variant utama (mis. `variant="primary"`).
   - Snapshot kelas Tailwind kunci (assert via `wrapper.classes()`).
3. Tidak boleh test internal Reka UI (sudah ditest upstream). Fokus pada wiring + variant CVA.

**Standar referensi:**

- `TDD-standart-prod.md Phase 1.3` ATOM rules.
- `standart-quality-code.md §3.1` Atomic design.

**Effort:** S (≈ 1 hari).

---

### FE-T04 — CI guard: no `console.log` di kode shipped

**Tujuan:** Sensitive data hygiene. `TDD-standart-prod.md Phase 0.8` melarang token/data sensitif keluar lewat `console.log`.

**Konteks saat ini:** Tidak ada contract test yang gagal kalau seseorang menambah `console.log`. `src/lib/logger.ts` adalah satu-satunya tempat resmi untuk log frontend.

**Acceptance Criteria:**

1. Test baru `src/__tests__/no-console-log.contract.test.ts`:
   - Glob seluruh `src/**/*.{ts,vue}` kecuali `src/lib/logger.ts` dan `**/*.spec.ts` / `**/*.test.ts` / `**/__tests__/**`.
   - Cari token `console.log`, `console.debug`, `console.info`, `console.warn`, `console.error`.
   - Whitelist: pemanggilan via `logger.*` di `src/lib/logger.ts`.
   - Fail kalau ditemukan match di luar whitelist.
2. Tambahan ESLint rule (kalau belum aktif):
   - `no-console: ['error', { allow: ['error'] }]` di `eslint.config.ts` dengan override `src/lib/logger.ts`.
3. Pre-commit / CI harus menolak PR yang melanggar.

**Standar referensi:**

- `TDD-standart-prod.md Phase 0.8`.
- `standart-quality-code.md` (sensitive data subsection).

**Effort:** S (≈ 0.5 hari).

---

### FE-T05 — Decomposisi `src/server/auth-handlers.ts`

**Tujuan:** File 468 baris memang masih di bawah hard cap (frontend tidak punya hard cap 500), tapi `standart-quality-code.md` mendorong target `< 300` untuk `.ts` handler. File ini juga overlap dengan FE-T01 sehingga lebih baik dipecah saat itu.

**Acceptance Criteria:**

1. Setelah FE-T01 selesai, decompose menjadi:
   - `src/server/auth/login-handler.ts`
   - `src/server/auth/callback-handler.ts`
   - `src/server/auth/logout-handler.ts`
   - `src/server/auth/refresh-handler.ts`
   - `src/server/auth/index.ts` re-exports.
2. Setiap file ≤ 200 baris. Setiap function ≤ 20 baris (`§2.2`).
3. Tidak ada perubahan behavior. Test existing (`callback-session-cookie.spec.ts`, `proxy-routes.spec.ts`, `auth-callback-jwks.spec.ts`) tetap PASS.

**Effort:** S (≈ 1 hari, bundling dengan FE-T01).

---

### FE-T06 — Cleanup audit & stale E2E

**Tujuan:** Beberapa file audit/recon sudah out-of-date dan E2E mungkin masih merujuk skema kontrak lama.

**Konteks saat ini:**

- `audit/backend-fr-gap.md` 0 byte.
- `audit/frontend-fr-gap.md` ~30 KB, tertanggal 2026-05-17 tetapi sudah tertimpa oleh `docs/audits/fr-001-fr-063-gap-audit.md`.
- `e2e/` directory ada dan `playwright.config.ts` aktif. Belum di-verifikasi apakah skenario-nya sinkron dengan endpoint terbaru.

**Acceptance Criteria:**

1. Konsolidasi `audit/`, `audit-context/`, `docs/audits/` menjadi satu sumber: `docs/audits/`. Pindahkan/arsipkan file lain ke `docs/audits/legacy/` dengan note tanggal.
2. Hapus `audit/backend-fr-gap.md` (0 byte) dan `audit-context/backend-fr029-fr063.md` (sudah tertutup).
3. Jalankan `npx playwright test --list` dan verifikasi semua scenario:
   - Hilangkan/perbaiki test yang masih merujuk endpoint legacy yang sudah tidak ada (mis. `/admin/*` dari Portal).
   - Tambahkan README di `e2e/README.md` yang menjelaskan Portal-only scope.

**Effort:** S.

---

### FE-T07 — Safe error display consistency

**Tujuan:** Pastikan semua page yang menampilkan error pakai `apiClient` + `ApiError` taxonomy + `SafeErrorPresenter`. Audit menyebut konsistensi belum 100%.

**Konteks saat ini:**

- `src/lib/api/safe-error-presenter.ts` ada + spec.
- `src/lib/oidc/oauth-error-message.ts` (189 baris) handle OAuth-error taxonomy.
- Beberapa page mungkin memformat error langsung dari `err instanceof Error ? err.message : String(err)`.

**Acceptance Criteria:**

1. Audit grep di seluruh `src/pages/**/*.vue` dan `src/composables/**/*.ts`:
   - Cari pattern `error.message`, `String(err)`, `err.toString()`.
   - Setiap match wajib di-route melalui `presentSafeError(err)` atau `resolveOAuthErrorMessage(err)`.
2. Tambah contract test `src/__tests__/safe-error-display.contract.test.ts` yang:
   - Glob page+composable.
   - Fail jika menemukan akses `error.message` tanpa wrapping melalui presenter.
   - Whitelist library files yang memang membuat presenter.
3. Untuk tiap finding, refactor agar pesan yang dilihat user lokalisasinya terjamin (`useI18n`).

**Standar referensi:**

- `design.md §error UX` — error harus deskriptif tetapi tidak menghukum, lokalisasi mengikuti user locale.
- `standart-quality-code.md` (FR-061/FR-062 alignment).

**Effort:** S (≈ 1 hari).

---

## 4. Sequencing & Dependencies

```
Sprint 1
  └─ FE-T01 (BFF opaque session — landasan untuk task lain)

Sprint 2
  ├─ FE-T03 (atom test parity)
  ├─ FE-T04 (no-console contract)
  ├─ FE-T05 (auth-handlers decomposition, depends on FE-T01)
  └─ FE-T06 (audit cleanup)

Sprint 3
  ├─ FE-T02 (email/phone UI, depends on backend BE-T02)
  └─ FE-T07 (safe error consistency)
```

Dependency utama:

- FE-T05 setelah FE-T01 (refactor di permukaan yang sama).
- FE-T02 setelah BE-T02 (kontrak API).
- FE-T07 paralel dengan FE-T02.

---

## 5. Validation Contract per Task

Setiap task wajib lulus pipeline berikut sebelum dianggap selesai:

```bash
cd services/sso-frontend

# 1. Lint + format + types
npm run lint
npm run typecheck

# 2. Test scoped
npx vitest run <pattern>

# 3. Full suite + build sebelum merge
npx vitest run
npm run build

# 4. Optional: e2e
npx playwright test
```

Untuk FE-T01 tambahan:

```bash
# Sanity check production build di kontainer Node
npm run build
node dist/server.js   # smoke
curl -I https://localhost/api/auth/session   # cookie payload tidak boleh decrypt ke token
```

---

## 6. Definition of Done — Frontend

Sebuah task FE-Txx hanya boleh ditandai DONE jika seluruh checkpoint berikut PASS (rujukan: `services/sso-frontend/TDD-standart-prod.md`).

### PHASE 0 — Pre-Implementation

- [ ] Requirement jelas, tidak ambigu.
- [ ] Layer diidentifikasi (atom/molecule/organism/page/composable/store/service/util).
- [ ] Component serupa sudah dicari di `atoms/`, `molecules/`, `organisms/`.
- [ ] Spec file kosong dengan `describe()` block sudah dibuat lebih dulu (Red → Green → Refactor).

### PHASE 1 — Component Architecture

- [ ] `<script setup lang="ts">`.
- [ ] `defineProps<Interface>()` typed.
- [ ] `defineEmits<Interface>()` typed.
- [ ] Tidak ada business logic di `<template>`.
- [ ] `v-html` hanya untuk konten yang dijamin sanitized.
- [ ] Atomic design level dipatuhi (atom tidak fetch, page hanya orchestrate).

### PHASE 2 — Code Quality

- [ ] `.vue` ≤ 300 baris, `.ts` composable ≤ 150, store ≤ 200, service ≤ 150.
- [ ] Function ≤ 20 baris, nested ≤ 3, cyclomatic ≤ 10.
- [ ] `import type {}` untuk pure type.
- [ ] Tidak ada `any` tanpa justifikasi tertulis.

### PHASE 3 — State & API

- [ ] HTTP via `services/*.api.ts` + `apiClient`. Tidak ada `fetch` mentah di component.
- [ ] Shared state di Pinia store, bukan global mutable.
- [ ] Token tidak menyentuh `localStorage` / `sessionStorage`.

### PHASE 4 — Sensitive Data

- [ ] Tidak ada `console.log` di kode produksi.
- [ ] Tidak ada PII di error message yang ditampilkan ke user (sudah lewat `SafeErrorPresenter`).
- [ ] Cookie payload yang berisi token: tidak ada (lihat FE-T01).

### PHASE 5 — Accessibility (design.md)

- [ ] Komponen interaktif memakai semantic element (`<button>`, `<a>`, Reka UI primitives).
- [ ] Kontras warna ≥ WCAG AA (4.5:1 normal text, 3:1 large text, 3:1 UI component).
- [ ] Focus indicator visible, keyboard-only flow lengkap.
- [ ] Form punya `<label>` + `aria-*` yang sesuai.

### PHASE 6 — Test

- [ ] Unit/spec untuk composable, store, dan komponen baru.
- [ ] Contract test untuk endpoint BFF baru (lihat `src/server/__tests__`).
- [ ] Snapshot tidak digunakan untuk test logic; hanya class wiring.

### PHASE 7 — Commit Readiness

- [ ] `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build` PASS.
- [ ] Coverage ≥ 80% file yang diubah.
- [ ] Conventional Commits (`feat(profile): …`, `fix(bff): …`).

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| FE-T01 outage karena store Redis down | Implementasi `PortalSessionStore` dengan circuit breaker + fallback ke "force re-login" page yang aman. |
| FE-T01 deploy boundary regression (token bocor ke browser) | Tambah `src/__tests__/deploy-bff-boundary.test.ts` (sudah ada) — tidak boleh dihapus; tambah assertion baru bahwa cookie payload tidak decrypt ke token. |
| FE-T02 race antar tab saat email berubah | Setelah konfirmasi, panggil `useSessionGuard.refresh()` agar tab lain re-fetch profile. |
| FE-T04 menolak penambahan `console.log` valid (dev only) | Sediakan `logger.dev()` di `src/lib/logger.ts` yang no-op di production build. |
| FE-T07 false-positive contract test | Whitelist regex eksplisit dengan komentar; review berkala saat library presenter diperbarui. |

---

## 8. Lampiran — Mapping ke Audit Findings

| Task ID | Audit reference | Severity asal |
| --- | --- | --- |
| FE-T01 | LIVE-004 (`fr-001-fr-063-gap-audit.md`); FR-013/017/037 | High |
| FE-T02 | FR-046 audit entry | Medium |
| FE-T03 | Cross-cutting §4.4 (test inventory shape) | Low |
| FE-T04 | Cross-cutting §4.5 (sensitive data + logging) | Low |
| FE-T05 | Cross-cutting §4.4 (file size hygiene) | Low |
| FE-T06 | Cross-cutting §4.3 + audit closure | Low |
| FE-T07 | Cross-cutting §4.5; FR-061/FR-062 | Low |

---

## 9. Catatan Khusus — Keterhubungan dengan Backend Plan

Beberapa task FE memerlukan kontrak API baru yang dirancang di `docs/execution-plan-backend.md`. Sinkronisasi:

| FE Task | BE Task | Kontrak yang dibutuhkan |
| --- | --- | --- |
| FE-T02 | BE-T02 | `POST /api/profile/email-change`, `POST /api/profile/email-change/confirm`, `POST /api/profile/phone-change`, `POST /api/profile/phone-change/confirm` |
| FE-T01 | — (no BE change) | BFF refactor murni di Node frontend; tidak menyentuh `services/sso-backend`. |

Definisi response sukses harus tetap `{success, message, data}` (`backend §7.2`) dan diparsing oleh `apiClient` (`frontend api-client.ts`).
