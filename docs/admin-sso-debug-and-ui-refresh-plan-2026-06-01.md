# admin-sso.timeh.my.id — Debug `/admin-error` + Rencana Refresh UI/UX

**Tanggal:** 2026-06-01
**Service / codebase:** `services/sso-admin-frontend` (sumber image untuk domain `admin-sso.timeh.my.id`)
**Backend kontrak:** `services/sso-backend` (`routes/admin.php`)
**Status:** 🔴 Blocker produksi aktif — **semua** user yang membuka `admin-sso.timeh.my.id` di-redirect ke `/admin-error`.

---

## 1. Context

### 1.1 Apa yang terjadi
Setiap pengunjung `https://admin-sso.timeh.my.id` (login maupun tidak) berakhir di `https://admin-sso.timeh.my.id/admin-error` dengan pesan:

> "Admin frontend belum bisa memuat status akses. Koneksi ke session admin atau admin API sedang bermasalah."

Pesan itu berasal dari `src/views/AdminErrorView.vue`, yang **hanya** dirender ketika router guard memutuskan state sesi = `error`.

### 1.2 Arsitektur singkat (relevan untuk bug)
- `sso-admin-frontend` = **SPA Vue statis** yang di-build lalu disajikan oleh **nginx** di dalam image (`Dockerfile` → `nginxinc/nginx-unprivileged`, config dari `nginx.conf`).
- SPA memanggil API admin via path **relatif** `/api/admin/*` (lihat `src/lib/api/api-client.ts` → `fetch(path)` tanpa base URL → **same-origin** ke `admin-sso.timeh.my.id`).
- Backend Laravel menyajikan API admin di prefix **`admin/api`** (lihat `routes/admin.php` baris 35: `->prefix('admin/api')`) → endpoint sebenarnya `/admin/api/me`, `/admin/api/users`, dst.
- Kontrak yang **diniatkan** (lihat `services/sso-frontend/src/server/admin-proxy.ts`):
  ```
  ADMIN_BFF_PREFIX     = '/api/admin'    // yang dipanggil SPA
  ADMIN_BACKEND_PREFIX = '/admin/api'    // yang disajikan backend
  ```
  Artinya desainnya: SPA memanggil `/api/admin/*`, lalu **sebuah proxy me-rewrite** `/api/admin/* → /admin/api/*` dan meneruskan ke backend. Pada arsitektur canary, proxy+rewrite ini disediakan oleh **portal BFF** (`sso-frontend`), bukan oleh nginx admin.

### 1.3 Rantai bukti root cause (sudah ditelusuri di kode)
1. `src/router/guards.ts` → `if (sessionResult === 'error') return { name: 'admin.error' }` → URL `/admin-error`.
2. `src/stores/session.store.ts` `ensureSession()` memanggil `authApi.getPrincipal()`. Catch hanya memetakan `ApiError`: `401→unauthenticated`, `403→forbidden`/`mfa_enrollment_required`, `412/428→step_up_required`. **Selain itu (termasuk error non-`ApiError`) → `return 'error'`.**
3. `src/services/auth.api.ts` → `getPrincipal()` = `apiClient.get('/api/admin/me')`.
4. `src/lib/api/api-client.ts` → `fetch('/api/admin/me', { credentials: 'include' })`. Jika `response.ok` → `return response.json()`. Tidak ada base URL → request **same-origin** ke `admin-sso.timeh.my.id`.
5. `nginx.conf` admin **tidak punya `location /api/`** atau proxy apa pun ke backend. Hanya ada `/healthz`, `/assets/`, dan `location /` dengan `try_files $uri $uri/ /index.html` (SPA fallback).
6. Maka `GET https://admin-sso.timeh.my.id/api/admin/me` → jatuh ke SPA fallback → mengembalikan **`index.html` dengan HTTP 200**.
7. `response.ok === true` → tidak ada `ApiError` dilempar → `await response.json()` mem-parse **HTML** → **`SyntaxError`** (bukan `ApiError`).
8. `ensureSession()` catch: `error instanceof ApiError` → **false** → jatuh ke `return 'error'` → guard → `/admin-error`.

### 1.4 Kenapa kena ke SEMUA user
Karena request tidak pernah sampai ke backend, **tidak ada respons 401/403** yang membedakan "belum login" (yang seharusnya redirect ke login) vs "tidak berhak". Semua orang mendapatkan kegagalan parse JSON yang identik → state `error` universal. Ini menegaskan ini **bukan** masalah sesi/izin, melainkan **masalah routing/proxy infrastruktur**.

### 1.5 Konteks UI/UX (codebase saat ini)
- `sso-admin-frontend` **tidak memakai design system**: `tailwindcss`, `reka-ui`, `class-variance-authority`, `lucide-vue-next`, `@vueuse/core` → **semua NONE** di `package.json`.
- Styling = `src/assets/main.css` hand-rolled **852 baris** + kelas utilitas ad-hoc (`state-card`, `primary-action`, `danger-action`, `hero-card`, `eyebrow`). Hanya 3 dari 30 `.vue` punya `<style>` lokal.
- Kontras dengan **portal `sso-frontend`** yang sudah memakai **Tailwind 4 + Reka UI + cva + lucide + tema glass** yang clean & profesional. Admin terlihat utilitarian, tidak konsisten dengan brand portal, dan state-nya (loading/empty/error) hanya teks polos.

---

## 2. Issue List

### Bagian A — Debugging `/admin-error` (Blocker → harus lebih dulu)

#### ISS-D1 · Admin nginx tidak punya reverse-proxy ke backend admin API 🔴 Blocker
- **Bukti:** `services/sso-admin-frontend/nginx.conf` hanya punya `/healthz`, `/assets/`, `location /` (SPA fallback). Tidak ada `proxy_pass` ke backend.
- **Akibat:** `/api/admin/*` di-serve sebagai `index.html` (200) → parse JSON gagal → `/admin-error` untuk semua user.
- **Issue:**
  - [ ] Tambahkan proxy di `nginx.conf`: `location /api/admin/ { rewrite ^/api/admin/(.*)$ /admin/api/$1 break; proxy_pass <backend-origin>; }`
  - [ ] Tambahkan juga `location /api/auth/ { proxy_pass <backend-origin>; }` (dipakai `authApi.getSession()` → backend `routes/auth.php` `/api/auth/session`, **tanpa** rewrite).
  - [ ] Teruskan header penting: `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Cookie`, `X-Request-Id`.
  - [ ] Backend origin: `https://api-sso.timeh.my.id` (default `SSO_PUBLIC_BASE_URL` di `deploy-main.yml`) atau service internal pada jaringan compose.

#### ISS-D2 · Path contract terbalik: `/api/admin/*` (FE) vs `/admin/api/*` (BE) 🔴 High
- **Bukti:** `auth.api.ts`/feature services pakai `/api/admin/*`; `routes/admin.php` prefix `admin/api`. Mapping rewrite hanya ada di portal BFF (`admin-proxy.ts`), tidak direplikasi di deploy standalone.
- **Issue:**
  - [ ] Pastikan proxy ISS-D1 melakukan rewrite `/api/admin → /admin/api` (atau pertimbangkan menambah alias `/api/admin` di backend — **tidak disarankan**, karena menduplikasi kontrak).
  - [ ] Tambahkan **contract test** yang mengunci mapping ini agar tidak drift.

#### ISS-D3 · api-client menelan respons 2xx non-JSON sebagai sukses → error generic 🟠 High
- **Bukti:** `api-client.ts` `request()` langsung `response.json()` pada semua `response.ok`; HTML 200 → `SyntaxError` tak tertangani sebagai `ApiError`.
- **Akibat:** `ensureSession()` tak bisa membedakan "API unreachable / salah route" dari error nyata → semua jadi `error` generic tanpa diagnosis.
- **Issue (defense-in-depth):**
  - [ ] `api-client` cek `Content-Type`/parse guard: jika 2xx tapi bukan JSON valid → lempar `ApiError(502, 'invalid_upstream_response', ...)`.
  - [ ] `ensureSession()` petakan kondisi unreachable ke state khusus (mis. `api_unreachable`) dengan copy yang akurat, bukan `error` generic.

#### ISS-D4 · Pertimbangan cookie/sesi lintas-subdomain 🟠 Medium
- **Context:** SPA di `admin-sso.timeh.my.id`, backend di `api-sso.timeh.my.id`. `credentials: 'include'` mengirim cookie sesuai origin tujuan. Bila proxy membuat request **same-origin** (`admin-sso → nginx → backend`), browser mengirim cookie ber-scope `admin-sso.timeh.my.id`; padahal cookie sesi SSO admin mungkin di-set untuk host lain.
- **Issue:**
  - [ ] Verifikasi domain & atribut cookie sesi admin (`__Host-` vs `Domain=.timeh.my.id`).
  - [ ] Putuskan strategi: (a) cookie `Domain=.timeh.my.id` agar dibagi lintas subdomain, atau (b) proxy meneruskan cookie via server-side, atau (c) **alternatif arsitektur** (lihat ISS-D6).

#### ISS-D5 · Tidak ada deteksi dini / observability kerusakan produksi 🟠 Medium
- **Context:** `/healthz` nginx hanya `return 200 "ok"` (cek nginx hidup, **bukan** konektivitas API). Bug ini lolos ke produksi tanpa alarm.
- **Issue:**
  - [ ] Tambahkan **smoke test pasca-deploy**: `GET https://admin-sso.timeh.my.id/api/admin/me` harus mengembalikan **401 JSON** (bukan HTML, bukan 404) saat anonim.
  - [ ] (Opsional) E2E Playwright "cold visit" yang gagal bila landing di `/admin-error`.

#### ISS-D6 · (Arsitektural, opsional) Sajikan admin lewat BFF yang sudah bekerja 🟡 Low/Medium
- **Context:** Portal BFF `admin-proxy.ts` **sudah** punya proxy+rewrite+penanganan sesi yang benar. Domain standalone menduplikasi tanpa lapisan itu.
- **Decision 2026-06-01:** Pertahankan `admin-sso.timeh.my.id` pada standalone admin frontend + nginx proxy untuk rilis ini. Jangan route seluruh host ke portal BFF sampai ada migrasi terencana untuk serving asset admin, parity `/api/admin/*`, smoke yang sama, dan rollback plan. Detail: `docs/decisions/admin-sso-serving-architecture-2026-06-01.md`.
- **Issue:**
  - [x] Evaluasi: pertahankan domain standalone + nginx proxy (cepat) **vs** arahkan `admin-sso` ke BFF/route yang sudah teruji (konsolidasi, hindari drift). Catat keputusan.

### Bagian B — Refresh UI & Peningkatan UX (setelah blocker beres)

#### ISS-U1 · Tidak ada design system / inkonsistensi dengan portal 🟠 Medium
- **Status 2026-06-01:** selesai untuk fondasi awal (`feat(admin-ui): add design system foundation`, commit `9700f78`). Tailwind 4, Reka UI, `cva`, `clsx`/`tailwind-merge`, `lucide-vue-next`, `tw-animate-css`, token Inter/Outfit, `cn()`, dan primitive awal sudah masuk; migrasi page dilakukan incremental di ISS-U2–U7.
- **Bukti awal:** sebelumnya tanpa Tailwind/Reka UI/cva/lucide; `main.css` 852 baris hand-rolled. Portal sudah Tailwind 4 + Reka UI.
- **Issue:**
  - [x] Adopsi fondasi: Tailwind 4 + Reka UI + `cva` + `clsx`/`tailwind-merge` + `lucide-vue-next`, selaras token portal (warna, radius, shadow, tipografi Inter/Outfit).

#### ISS-U2 · State loading/empty/error/forbidden hanya teks polos 🟠 Medium
- **Status 2026-06-01:** selesai (`feat(admin-ui): refresh state primitives and shell`). Primitive `UiSkeleton`, `UiEmptyState`, `UiStatusView` masuk; dashboard loading/empty/error mulai memakai primitive; error/forbidden/MFA/API-unreachable views memakai status view dengan recovery actions dan evidence slot.
- **Bukti:** "Memuat users...", panel `state-card` teks; `AdminErrorView`/`ForbiddenView` minim.
- **Issue:**
  - [x] Skeleton loader untuk list/detail/dashboard.
  - [x] Empty-state dengan ikon + copy + CTA.
  - [x] Redesign error/forbidden/mfa-required/step-up views (jelas, ada langkah pemulihan, correlation ID rapi).

#### ISS-U3 · Form mentah & tidak konsisten 🟡 Low/Medium
- **Status 2026-06-01:** selesai untuk primitive reusable. `UiFormField`, `UiInput`, `UiSelect`, `UiTextarea`, dan `UiSwitch` tersedia dengan label/hint/error/required/disabled/focus-ring; migrasi tiap page dilakukan incremental tanpa mengubah kontrak API.
- **Bukti:** `<input>/<select>/<textarea>` mentah, label wrap manual, spacing ad-hoc, afford validasi minim.
- **Issue:**
  - [x] Komponen `Field`/`Input`/`Select`/`Textarea`/`Switch` konsisten (label, hint, error, required, disabled, focus ring).

#### ISS-U4 · List/tabel basic, tanpa densitas/sort/paginasi visual 🟡 Low/Medium
- **Status 2026-06-01:** selesai untuk primitive reusable + adoption awal. `UiDataList` tersedia dengan kolom, density, sticky header, cursor pagination labels/actions, dan row action slot; sessions page sudah memakai komponen ini.
- **Bukti:** daftar `<button>` (users/clients/audit), tanpa tabel data terstruktur.
- **Issue:**
  - [x] Komponen `DataTable`/`DataList` (kolom, densitas, sort, sticky header, paginasi cursor yang sudah ada di store audit).

#### ISS-U5 · Shell & navigasi minim 🟡 Low/Medium
- **Status 2026-06-01:** selesai. `AdminShellLayout` memiliki topbar, breadcrumb, responsive drawer mobile, polished active menu, principal role block, theme toggle, dan logout action.
- **Bukti:** `AdminShellLayout` sidebar sederhana, tanpa active-state polish, breadcrumb, responsive/mobile, atau menu principal yang rapi.
- **Issue:**
  - [x] Refresh shell: sidebar + topbar, active state, breadcrumb, responsif (drawer mobile), blok principal/role + tombol logout.

#### ISS-U6 · Feedback aksi tanpa toast/notifikasi 🟡 Low
- **Status 2026-06-01:** selesai. `UiToastProvider` + `useToast()` tersedia; `App.vue` memasang toast region global; sessions revoke flow mulai mengirim toast sukses/gagal/step-up dengan copy ringkas dan request ID bila aman untuk tidak menduplikasi evidence yang diuji.
- **Bukti:** hasil aksi muncul sebagai teks inline (`action-message`).
- **Issue:**
  - [x] Sistem toast (sukses/gagal/step-up) konsisten + ringkas, menampilkan request/correlation ID untuk investigasi.

#### ISS-U7 · a11y belum tersistem & tanpa dark mode/tema 🟡 Low
- **Status 2026-06-01:** selesai untuk fondasi. Token light/dark sudah ada, `useTheme()` + `UiThemeToggle` tersambung ke shell, focus ring konsisten untuk control baru, skip-link/landmark tetap ada, dan label shell baru sudah masuk i18n `id/en`.
- **Bukti:** `ConfirmDialog` sudah punya focus-trap (RG/XG), tapi kontras/keyboard/landmark belum diaudit menyeluruh; tidak ada dark mode (portal punya theme toggle).
- **Issue:**
  - [x] Token tema + dark mode; audit kontras WCAG AA; landmark/skip-link; fokus konsisten.
  - [x] Selaraskan i18n bila admin diputuskan bilingual (lihat DG-01 di audit konformansi).

---

## 3. Plan

> Guardrail: ikuti `services/sso-admin-frontend/TDD-standart-prod.md` & `standart-quality-code.md`. Conventional Commits (technical). Tiap fase: type-check → lint → unit test → (e2e bila relevan) → build → CI → deploy via `deploy-main.yml`. **Fase 0 wajib lebih dulu** (memulihkan produksi).

### FASE 0 — Pulihkan konektivitas admin API (P0, blocker) 🔴
**Tujuan:** `admin-sso.timeh.my.id` berhenti melempar `/admin-error`; anonim → redirect login, admin sah → dashboard.

1. **(Pilihan A — direkomendasikan, paling cepat & faithful)** Tambah reverse-proxy di `services/sso-admin-frontend/nginx.conf`:
   - `location /api/admin/ { rewrite ^/api/admin/(.*)$ /admin/api/$1 break; proxy_pass https://api-sso.timeh.my.id; proxy_set_header Host api-sso.timeh.my.id; proxy_set_header X-Forwarded-* ...; proxy_pass_request_headers on; }`
   - `location /api/auth/ { proxy_pass https://api-sso.timeh.my.id; ... }` (tanpa rewrite).
   - Sesuaikan **CSP `connect-src`** (sudah `'self' https://*.timeh.my.id`, aman untuk same-origin).
2. Selesaikan **cookie/sesi** (ISS-D4): pastikan cookie sesi admin terkirim ke backend lewat proxy (set `Domain=.timeh.my.id` di backend, atau forward cookie server-side). **Verifikasi dengan `curl`/browser**.
3. **Defense-in-depth (ISS-D3):** patch `api-client` agar 2xx non-JSON → `ApiError`, dan `ensureSession()` punya state `api_unreachable` + view yang informatif (TDD).
4. **Smoke test pasca-deploy (ISS-D5):** skrip CI memverifikasi `GET /api/admin/me` anonim mengembalikan **401 JSON**.
5. **Contract test (ISS-D2):** kunci mapping `/api/admin/* → /admin/api/*`.
6. Verifikasi end-to-end di domain hidup (cold visit tidak landing `/admin-error`), commit, deploy, pantau CI.

**Definition of done Fase 0:** anonim → login redirect; admin tanpa MFA → `admin.mfa-required` (bukan `/admin-error`); admin sah → dashboard; smoke test hijau.

### FASE 1 — Fondasi design system
- Pasang Tailwind 4 + Reka UI + cva + tailwind-merge + lucide; definisikan token (warna/radius/shadow/tipografi) selaras portal; siapkan `cn()`.
- Migrasikan `main.css` ke `@theme` + utilities; pertahankan kelas lama sementara (shim) agar tidak meledak sekaligus.

### FASE 2 — Komponen primitif (atoms/molecules)
- `Button`, `Input`, `Select`, `Textarea`, `Field`, `Card`, `Badge`, `StatusPill`, `Table/DataList`, `Dialog/AlertDialog` (Reka UI), `Skeleton`, `Toast`, `EmptyState`, `PageHeader`.
- Tiap komponen: unit test + a11y dasar (label/role/focus).

### FASE 3 — Refresh shell & navigasi (ISS-U5)
- `AdminShellLayout`: sidebar permission-aware (sudah ada `menus.visible`), topbar, breadcrumb, responsif, blok principal + logout. Active-state & ikon lucide.

### FASE 4 — Refresh halaman per fitur (incremental, satu per PR)
**Status 2026-06-01:** selesai untuk seluruh 11 page admin. `dashboard`, `users`, `clients`, `audit`, `sessions`, `policy`, `ip-access`, `external-idps`, `sso-error-templates`, `oidc-foundation`, dan `ops` sudah memakai primitive Fase 2 untuk loading/error/empty state dan/atau list/form sesuai kebutuhan halaman. Store, permission gating, step-up, destructive confirmation, dan correlation evidence dipertahankan. Kelas legacy masih tersisa sebagai shim content-card di beberapa section sampai `Card` primitive final menggantikan semua panel non-state.

Urutan disarankan (tinggi → rendah traffic/nilai): `dashboard` → `users` → `clients` → `audit` → `sessions` → `policy` → `ip-access` → `external-idps` → `sso-error-templates` → `oidc-foundation` → `ops`.
- Tiap halaman: pakai primitif Fase 2, tabel/skeleton/empty-state, pertahankan logika store/permission/step-up yang sudah ada (jangan regresikan NG/DG/XG/RG).

### FASE 5 — Polish state & feedback (ISS-U2, U6)
**Status 2026-06-01:** selesai untuk state/feedback global dan dipakai ulang di seluruh page admin. Error/forbidden/API state memakai `UiStatusView`, loading memakai skeleton, empty state memakai icon/copy/CTA slot, dan action feedback tetap aman terhadap duplikasi request ID yang diuji E2E.

- Redesign `AdminErrorView`/`ForbiddenView`/`AdminMfaRequiredView`/step-up; toasts; loading/empty seragam; correlation ID rapi.

### FASE 6 — a11y, dark mode, QA visual (ISS-U7)
**Status 2026-06-01:** selesai untuk fondasi dan regression gate seluruh page. Shell memiliki skip-link/landmark/theme toggle; primitive baru memakai label/focus-ring/role yang konsisten; dark token tetap aktif; E2E memverifikasi navigasi, forbidden/error, step-up, dan evidence flow setelah refresh semua page.

- Dark mode + token; audit kontras WCAG AA; keyboard/landmark/skip-link; visual regression ringan (Playwright screenshot opsional); i18n alignment bila diputuskan.

---

## 4. Prioritas & Urutan

| Prioritas | Item | Catatan |
|-----------|------|---------|
| **P0** | ISS-D1, ISS-D2, ISS-D3, ISS-D4, ISS-D5 (Fase 0) | Blocker produksi — kerjakan dulu, terisolasi dari UI. |
| **P1** | ISS-U1, ISS-U2 + Fase 1–3 | Fondasi + shell + state; dampak visual terbesar. |
| **P2** | Fase 4 (per halaman) | Incremental, aman, satu PR per halaman. |
| **P3** | ISS-D6 (arsitektur), Fase 5–6 | Konsolidasi & polish lanjutan. |

---

## 5. Catatan Verifikasi & Risiko
- **Jangan gabung** perbaikan Fase 0 dengan refresh UI dalam satu PR — blocker harus cepat, kecil, dan mudah di-rollback.
- Refactor UI **tidak boleh** meregresikan kontrol yang sudah ada (permission gating NG-01, audit search NG-02, confirm dialog DG-03, step-up DG-02, security headers RG-01). Pertahankan test terkait.
- Karena bug ini lolos akibat e2e/unit memakai **API ter-mock**, tambahkan minimal satu **uji konektivitas nyata** (smoke pasca-deploy) agar regresi proxy ketahuan.
- Konfirmasi **backend origin** & **strategi cookie lintas-subdomain** sebelum mengunci Fase 0 (satu-satunya unknown nyata).

_Disusun 2026-06-01. Fokus: pemulihan `/admin-error` lalu peningkatan UI/UX `sso-admin-frontend` menjadi clean & professional._
