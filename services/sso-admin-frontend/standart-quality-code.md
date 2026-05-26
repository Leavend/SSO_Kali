# SSO Admin Frontend — Standar Quality Code

## File: `services/sso-admin-frontend/standart-quality-code.md`

> Dokumen ini adalah standar wajib penulisan codebase untuk `sso-admin-frontend`.
>
> **Source audit:** `docs/audits/fr-001-fr-063-gap-audit.md`
>
> **Tech Stack saat ini:** Vue 3.5 · TypeScript 6 strict · Pinia 3 · Vue Router 5 · Vite 8 · Vitest 4 · Playwright · ESLint 9 · oxlint · Prettier 3.8

---

## 1. Misi dan Scope

`sso-admin-frontend` adalah control plane admin SSO, bukan portal user biasa. UI ini harus membantu menutup gap audit FR-001–FR-063, terutama:

- GAP-001 — admin frontend masih readiness-only.
- GAP-002 — frontend authorization masih role-only, sementara backend sudah permission-based.
- GAP-004 — operational evidence belum audit-closed.
- GAP-005 — IP allow/blocklist belum menjadi control surface first-class.
- GAP-006 — security notification dan suspicious-login breadth perlu evidence.

Scope utama admin frontend:

- Dashboard governance — FR-050 / UC-52.
- User lifecycle, role assignment, MFA/password/session actions — FR-051, FR-022 / UC-50, UC-53–UC-56.
- Client, scopes, redirect URI, consent policy, dan secret lifecycle — FR-006, FR-008–FR-012, FR-054 / UC-03–UC-09, UC-60–UC-61.
- Audit, export, integrity, DSR, dan compliance evidence — FR-044, FR-049, FR-052, FR-063 / UC-41–UC-42, UC-57–UC-59, UC-63, UC-65.
- RBAC dan permission management — FR-053 / UC-51, UC-56–UC-57, UC-73.
- Security policy, step-up, activation, rollback — FR-055 / UC-62, UC-68, UC-70.
- External IdP, mapping, health, failover — FR-057–FR-059 / UC-81–UC-82.
- Ops and incident evidence surfaces — FR-056, FR-063 / UC-75, UC-77–UC-83.

---

## 2. Prinsip Utama

1. **Backend adalah security boundary.** Frontend hanya melakukan UX/access minimization; enforcement tetap di backend.
2. **Permission-aware by default.** Role `admin` hanya boleh menjadi bootstrap shell, bukan dasar final akses fitur production.
3. **Same-origin session only.** Semua API admin memakai relative path dan cookie session dengan `credentials: 'include'`.
4. **No browser token handling.** Jangan simpan, baca, membuat, menukar, atau log access token, refresh token, ID token, client secret, atau credential rahasia di browser.
5. **Every feature is audit-sensitive.** Setiap page/action harus punya loading, empty, error, forbidden, success, dan evidence state yang tepat.
6. **Test first.** Behavior baru harus dimulai dari failing test sesuai `services/sso-admin-frontend/TDD-standart-prod.md`.

---

## 3. Dependency Honesty

Standar ini mengikuti dependency yang benar-benar ada di `services/sso-admin-frontend/package.json`.

Dependency runtime saat ini:

- `vue`
- `vue-router`
- `pinia`

Tooling saat ini:

- Vite
- Vue TSC / TypeScript strict
- Vitest
- Playwright
- ESLint
- oxlint
- Prettier

Jangan menulis standar atau code yang mengasumsikan library berikut sudah wajib tersedia kecuali memang sudah ditambahkan lewat dependency decision terpisah:

- Tailwind CSS
- Reka UI
- VueUse
- CVA / class-variance-authority
- Lucide icon set
- UI kit lain dari `sso-frontend`

Jika library baru memang diperlukan, buat keputusan eksplisit: alasan, dampak bundle, aksesibilitas, testing, dan maintenance cost.

---

## 4. Struktur Arsitektur

### 4.1 Folder ownership

Gunakan struktur domain ketika fitur admin mulai bertambah:

```text
src/features/dashboard
src/features/users
src/features/sessions
src/features/clients
src/features/audit
src/features/rbac
src/features/security-policies
src/features/data-subject-requests
src/features/external-idps
src/features/ops
```

Shared UI tetap berada di:

```text
src/components
```

Shared API, auth, dan utilitas lintas domain tetap berada di:

```text
src/lib
src/services
src/stores
src/types
```

### 4.2 Page dan component boundary

- Page mengatur layout, route-level state, dan komposisi domain component.
- Component reusable tidak boleh memanggil API langsung.
- Component action harus menerima permission/capability state sebagai prop atau dari composable domain yang jelas.
- Jangan membuat component besar yang mencampur data fetching, permission mapping, table rendering, dialog destructive action, dan toast/error normalization dalam satu file.
- Jangan membuat abstraction generik sebelum ada kebutuhan nyata di minimal dua domain.

### 4.3 Service boundary

- Semua HTTP request harus lewat `src/lib/api/api-client.ts` atau wrapper service domain yang memakai client tersebut.
- Tidak boleh ada `fetch()` langsung di page/component.
- Service module tidak boleh akses router, Pinia store, DOM, `window.location`, atau UI state.
- Service module hanya menerima input typed dan mengembalikan DTO typed atau error typed.

---

## 5. API Client dan DTO Standards

### 5.1 HTTP rules

Semua API admin harus:

- memakai relative same-origin path, contoh `/admin/api/users`;
- memakai `credentials: 'include'`;
- mengirim `Accept: application/json`;
- tidak menaruh token, secret, atau credential di header browser;
- tidak membangun URL dari input bebas tanpa validasi boundary.

### 5.2 DTO rules

Untuk setiap route family, buat type DTO yang eksplisit:

```typescript
export type AdminUserSummary = {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly roles: readonly string[]
  readonly status: 'active' | 'locked' | 'disabled'
}
```

Standar DTO:

- Gunakan `readonly` untuk response shape.
- Hindari `any`; pakai `unknown` di boundary lalu normalize.
- Jangan mengekspos field backend yang tidak dipakai UI.
- Jangan menyimpan raw secret/token dalam DTO store jangka panjang.
- Bedakan masked value dari plaintext one-time secret.

### 5.3 Error model

Sebelum memperluas write/destructive flow, siapkan error model typed untuk minimal:

- `401` unauthenticated/session expired.
- `403` forbidden/missing permission.
- `419` CSRF atau session expired jika berlaku.
- `422` validation error.
- `429` rate limited.
- `5xx` backend unavailable/error.

UI tidak boleh menampilkan raw backend exception/message. Tampilkan copy aman dan, bila tersedia, request ID/correlation ID untuk troubleshooting.

---

## 6. RBAC dan Permission Model

### 6.1 Role bootstrap

Role `admin` boleh dipakai untuk bootstrap shell awal:

- redirect user unauthenticated ke portal login;
- menolak user non-admin dari admin shell;
- menjaga readiness shell tetap aman selama migrasi.

Namun, fitur production harus permission-aware.

### 6.2 Permission-aware feature access

Setiap feature route/action harus mengacu ke permission backend dari kontrak route admin, bukan nama ad-hoc frontend.

Target source principal/permission:

```text
/admin/api/me
```

Atau endpoint bootstrap setara jika backend contract berubah.

Route meta feature harus mendeklarasikan kebutuhan akses:

```typescript
{
  path: '/audit',
  name: 'admin.audit.index',
  component: () => import('@/features/audit/pages/AuditEventsPage.vue'),
  meta: {
    requiresAdmin: true,
    permissions: ['audit.read'],
  },
}
```

### 6.3 UI minimization

- Navigation menyembunyikan module yang tidak boleh diakses principal.
- Action button disembunyikan atau disabled saat permission tidak ada.
- Direct URL access tanpa permission menampilkan forbidden state aman.
- Backend `403` tetap harus ditangani walau UI sudah menyembunyikan action.
- Jangan membuat keputusan sensitif hanya dari client state.

Middleware backend yang harus dihormati:

- `AdminGuard`
- `EnsureAdminMfaEnrolled`
- `EnsureAdminMfaAssurance`
- `EnsureFreshAdminAuth`
- `RequireAdminPermission`
- `RequireAdminSessionManagementRole`

---

## 7. Governance UI Standards

Setiap page admin wajib memiliki state berikut:

```text
loading
empty
error
forbidden
success
```

### 7.1 Dashboard

- Summary metrics tidak boleh memuat secret/token.
- Empty state harus membedakan belum ada data vs tidak punya permission.
- Error state harus menampilkan safe copy dan request/correlation ID jika tersedia.

### 7.2 User lifecycle

- Lock/unlock, deactivate/reactivate, password reset, MFA reset, role assignment, dan session termination harus memakai confirmation sesuai impact.
- Tampilkan subject/user identifier yang cukup untuk operator, tapi minimalkan PII.
- Setelah action, refresh state atau update cache secara eksplisit agar tidak stale.

### 7.3 Client management

- Redirect URI dan post-logout URI harus exact-match oriented.
- Secret rotation plaintext hanya boleh one-time display.
- Suspend/decommission harus menampilkan token/session/client impact sebelum submit.
- Scope/consent policy harus jelas membedakan machine-readable scope dan human-readable explanation.

### 7.4 Audit, compliance, dan export

- Audit list/detail harus mendukung event ID, request ID, correlation ID, SID, client ID, dan subject/user identifier bila backend menyediakan.
- Export flow termasuk privileged action; wajib permission, error handling, rate limit, dan evidence state.
- Integrity/evidence status harus dibedakan dari UI success biasa.

### 7.5 RBAC

- Permission matrix harus jelas membedakan role, permission, dan assignment.
- Missing permission state harus aman dan tidak bocor raw backend policy detail.
- Bulk assignment harus punya summary perubahan sebelum submit.

### 7.6 Security policy

- Draft, activate, rollback, dan policy versioning harus menunjukkan risk/impact summary.
- Action activation/rollback harus menghormati fresh-auth, step-up, atau MFA assurance dari backend.

### 7.7 External IdP

- Provider config harus meminimalkan secret exposure.
- Mapping preview harus read-only dan tidak menulis config tanpa submit eksplisit.
- Health/failover/disable state harus menampilkan operational impact.

### 7.8 Ops dan incident

- Readiness/health surfaces harus membedakan service status, evidence status, dan action requirement.
- Runbook/evidence links tidak boleh mengandung secret.
- IP allow/blocklist UI harus menjelaskan ownership, source of truth, dan rollback path.

---

## 8. Privileged Action Standards

Action berikut selalu dianggap privileged:

```text
write
destructive
export
one-time-secret
operational-evidence
```

Standar wajib:

- Confirmation dialog untuk destructive action.
- Impact summary sebelum submit.
- Primary destructive button disabled sampai confirmation valid.
- Cancel tidak memanggil API.
- Loading/disabled state reset setelah error.
- Safe success copy tanpa secret/PII berlebih.
- Backend `401`, `403`, `419`, `422`, `429`, dan `5xx` ditangani.
- Fresh-auth, step-up, atau MFA assurance state ditampilkan jika backend meminta.
- Audit/correlation evidence disimpan atau ditampilkan di state yang tepat.

---

## 9. Sensitive Data Standards

Hard rules:

- Jangan simpan access token, refresh token, ID token, client secret, atau credential rahasia di `localStorage`, `sessionStorage`, IndexedDB, Pinia persisted storage, URL, console, analytics, atau screenshot evidence.
- Jangan melakukan OAuth code/token exchange di browser admin frontend.
- Jangan menaruh secret di query string/hash.
- Jangan log raw PII, token, secret, raw backend error, atau full request/response sensitif.
- Jangan membuat browser-held backend secret.

One-time secret flow:

- Plaintext hanya tampil satu kali setelah backend mengirimkannya.
- Tampilkan warning eksplisit sebelum copy/reveal.
- Copy action harus dites.
- Setelah modal/page ditutup, plaintext tidak boleh tertinggal di Pinia atau component state jangka panjang.
- Jika backend mengizinkan masked value, simpan hanya masked value.

PII minimization:

- List admin harus paginated/filterable; jangan render dataset besar penuh tanpa kebutuhan.
- Tampilkan identifier yang cukup untuk action aman, bukan semua field sensitif.
- Evidence/screenshot harus redact secret dan PII kecuali user secara eksplisit meminta sebaliknya.

---

## 10. Styling dan Accessibility Standards

Saat ini `sso-admin-frontend` memakai custom CSS. Jangan mewajibkan Tailwind/Reka/UI kit sampai dependency ditambahkan secara sengaja.

Wajib:

- Semantic HTML untuk landmark, heading, form, table, dialog, dan button.
- Semua interactive element bisa diakses keyboard.
- Visible focus state untuk link, button, input, tab, dialog trigger, dan menu item.
- Dialog destructive action harus punya accessible name dan focus management.
- Tooltip/info popover harus bisa diakses via keyboard, bukan hanya hover.
- Table besar harus responsive; gunakan card/stacked layout jika viewport kecil.
- Long ID, email, subject, SID, client ID, request ID, dan correlation ID harus wrap/break tanpa merusak layout.
- Dark/light mode harus memakai semantic token atau CSS variable yang konsisten.
- Jangan pakai warna sebagai satu-satunya indikator status.

---

## 11. Testing Standards

Ikuti `services/sso-admin-frontend/TDD-standart-prod.md`.

Minimal test untuk feature permission:

```text
unauthenticated user → redirect/login atau session-expired state
authenticated non-admin → forbidden
admin without permission → forbidden / action hidden
admin with permission → feature/action visible and usable
backend 403 despite UI permission → safe forbidden message
```

Minimal test untuk privileged action:

```text
allowed success path
missing permission / 403
unauthenticated / 401
CSRF/session expired / 419 jika berlaku
rate limit / 429
validation error / 422
fresh-auth / step-up / MFA assurance required
backend 5xx safe error copy
audit/correlation ID evidence
loading/disabled state reset setelah error
```

E2E wajib untuk:

- critical navigation;
- forbidden flow;
- dashboard/admin shell bootstrap;
- privileged governance flow;
- one-time secret display;
- audit/export flow;
- role/permission matrix high-risk path.

---

## 12. Verification Gates

Sebelum menyatakan selesai, jalankan dari `services/sso-admin-frontend`:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

Tambahkan E2E untuk route/navigation/critical governance UI:

```bash
npm run test:e2e
```

Jika command blocked oleh environment/tooling, laporkan command dan alasan block. Jangan klaim PASS untuk command yang tidak berjalan.

---

## 13. Definition of Done

Feature admin frontend hanya boleh dianggap selesai jika:

- Requirement terhubung ke FR/UC dan audit gap jika relevan.
- Backend endpoint dan permission sudah jelas.
- Failing test sudah diamati sebelum production code.
- Permission-aware UI tersedia untuk route, navigation, dan action.
- Backend `401/403/419/422/429/5xx` ditangani aman.
- Loading, empty, error, forbidden, success states tersedia.
- Fresh-auth/MFA/step-up state ditangani jika route backend memerlukannya.
- No token/secret browser storage.
- Same-origin API dengan `credentials: 'include'`.
- Audit/correlation evidence ditampilkan atau disimpan sesuai kebutuhan.
- Verification gates berjalan atau block dilaporkan eksplisit.

---

## 14. Forbidden Practices

Jangan lakukan hal berikut:

```text
fetch langsung di component/page
client-only authorization untuk action sensitif
role-only feature access untuk fitur production
permission string ad-hoc yang tidak sesuai backend
raw backend error ditampilkan ke user
secret/token/PII logging
token/secret di localStorage/sessionStorage/IndexedDB/URL/console
OAuth code/token exchange di browser
one-time secret disimpan di Pinia setelah modal/page ditutup
hardcoded path string di component untuk route internal yang punya route name
admin governance UI dimasukkan kembali ke services/sso-frontend
menganggap Tailwind/Reka/VueUse sebagai dependency admin frontend saat belum ada
menghapus/men-disable backend enforcement karena UI sudah menyembunyikan tombol
```
