# AI Agent — SSO Admin Frontend TDD Self-Check Prompt

## File: `services/sso-admin-frontend/TDD-standart-prod.md`

> Dokumen ini adalah instruksi wajib untuk AI Agent dan developer sebelum menyatakan task, fitur, atau perubahan kode pada `sso-admin-frontend` selesai.
>
> **Source audit:** `docs/audits/fr-001-fr-063-gap-audit.md`
>
> **Tech Stack saat ini:** Vue 3.5 · TypeScript 6 strict · Pinia 3 · Vue Router 5 · Vite 8 · Vitest 4 · Playwright · ESLint 9 · oxlint · Prettier 3.8
>
> Jangan skip satu phase pun. Jika satu checkpoint gagal, hentikan implementasi, perbaiki, lalu ulangi check dari awal.

---

## Prinsip utama

1. **Test first.** Tidak ada production code untuk behavior baru tanpa failing test lebih dulu.
2. **Backend adalah security boundary.** Frontend permission check hanya untuk UX/access minimization; backend tetap harus menolak request yang tidak berhak.
3. **Admin UI adalah control plane.** Setiap fitur admin harus bisa ditelusuri ke FR/UC, permission backend, audit event, dan evidence yang dibutuhkan.
4. **No browser token handling.** Admin frontend tidak boleh menyimpan, membuat, menukar, atau membaca access token, refresh token, ID token, client secret, atau credential rahasia di browser.
5. **Same-origin session only.** Semua API admin menggunakan cookie session same-origin dengan `credentials: 'include'`.

---

## PHASE 0 — REQUIREMENT, AUDIT, AND TEST PLAN

Sebelum menulis kode, jawab checklist ini.

```text
[ ] 0.1 — Requirement jelas dan terhubung ke FR/UC?
          Contoh: FR-050 / UC-52 untuk dashboard admin.

[ ] 0.2 — Apakah task ini menutup gap audit?
          Referensi gap dari docs/audits/fr-001-fr-063-gap-audit.md:
          GAP-001 admin frontend readiness-only
          GAP-002 role-only frontend authorization
          GAP-004 operational evidence belum audit-closed
          GAP-005 IP allow/blocklist control surface
          GAP-006 security notification / suspicious-login breadth

[ ] 0.3 — Backend endpoint sudah diidentifikasi?
          Contoh:
          /admin/api/me
          /admin/api/dashboard/summary
          /admin/api/users
          /admin/api/clients
          /admin/api/audit/events
          /admin/api/audit/export
          /admin/api/security-policies/{category}

[ ] 0.4 — Permission backend sudah diidentifikasi?
          Jangan hanya pakai role admin untuk feature access.

[ ] 0.5 — Klasifikasi action sudah jelas?
          read / write / destructive / export / one-time-secret / operational-evidence.

[ ] 0.6 — Fresh-auth, step-up, atau MFA assurance diperlukan?
          Jika backend route write/destructive memakai step-up, UI harus punya state dan copy aman.

[ ] 0.7 — Audit/correlation evidence sudah direncanakan?
          Tentukan event ID, request ID, correlation ID, SID, client ID, atau subject ID yang perlu tampil.

[ ] 0.8 — Failing test pertama sudah ditulis atau direncanakan?
          Minimal satu test harus gagal karena behavior belum ada, bukan karena typo/setup error.

[ ] 0.9 — Tidak ada secret/token yang perlu disimpan di browser?
          Jika flow menampilkan client secret rotation, plaintext hanya boleh one-time display.

[ ] 0.10 — Existing component/store/service bisa dipakai ulang?
           Cek src/components, src/lib/api/api-client.ts, src/stores/session.store.ts, dan service yang ada.
```

Jika ada jawaban “belum” atau “tidak tahu”, selesaikan dulu sebelum coding.

---

## PHASE 1 — ADMIN SECURITY BOUNDARY CHECK

Backend admin API sudah dilindungi oleh middleware di `services/sso-backend/routes/admin.php`. Frontend tidak boleh mengganti enforcement tersebut.

```text
[ ] 1.1 — Flow memakai backend sebagai source of truth untuk authorization.

[ ] 1.2 — UI hanya menyembunyikan/men-disable action sebagai UX minimization.

[ ] 1.3 — Backend 401/403 tetap ditangani walau UI sudah menyembunyikan action.

[ ] 1.4 — Flow tidak membuat client-side-only authorization decision untuk action sensitif.

[ ] 1.5 — Flow tidak menukar OAuth code/token di browser.

[ ] 1.6 — Flow tidak menyimpan token di localStorage, sessionStorage, IndexedDB, Pinia persisted storage, URL, console, atau analytics.

[ ] 1.7 — API call tetap same-origin relative path dan memakai credentials include.
```

Middleware backend yang harus dihormati:

- `AdminGuard`
- `EnsureAdminMfaEnrolled`
- `EnsureAdminMfaAssurance`
- `EnsureFreshAdminAuth`
- `RequireAdminPermission`
- `RequireAdminSessionManagementRole`

---

## PHASE 2 — PRINCIPAL AND PERMISSION BOOTSTRAP

Role-only guard `admin` boleh dipakai untuk bootstrap shell. Feature admin production harus permission-aware.

```text
[ ] 2.1 — Jika membuat feature route, principal/permission source sudah jelas.
          Target: /admin/api/me atau endpoint bootstrap yang setara.

[ ] 2.2 — Route meta mendeklarasikan permission yang diperlukan.

[ ] 2.3 — Navigation menyembunyikan module yang tidak boleh diakses principal.

[ ] 2.4 — Component/action button menyembunyikan atau men-disable action tanpa permission.

[ ] 2.5 — Direct URL access tanpa permission menampilkan forbidden state aman.

[ ] 2.6 — Backend 403 tidak bocor sebagai raw backend error.
```

Test wajib untuk feature permission:

```text
[ ] unauthenticated user → redirect/login atau session-expired state
[ ] authenticated non-admin → forbidden
[ ] admin without permission → forbidden / action hidden
[ ] admin with permission → feature/action visible and usable
[ ] backend 403 despite UI permission → safe forbidden message
```

---

## PHASE 3 — ROUTE AND NAVIGATION TDD

Untuk setiap route admin baru:

```text
[ ] 3.1 — Route punya name yang stabil, bukan path string hardcoded di component.

[ ] 3.2 — Route component lazy-loaded jika sudah menjadi feature page besar.

[ ] 3.3 — Route meta minimal memuat requiresAdmin.

[ ] 3.4 — Route meta feature memuat required permission(s).

[ ] 3.5 — Route meta write/destructive memuat fresh-auth/step-up requirement jika relevan.

[ ] 3.6 — Unit test guard ditulis sebelum route behavior diubah.

[ ] 3.7 — E2E ditambahkan untuk critical navigation / forbidden flow.
```

Contoh route meta target:

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

Permission string harus mengikuti kontrak backend yang berlaku, bukan nama ad-hoc di frontend.

---

## PHASE 4 — PRIVILEGED ACTION TDD

Setiap action write/destructive/export/secret harus punya failing tests sebelum implementasi.

Wajib cover:

```text
[ ] 4.1 — allowed success path.
[ ] 4.2 — missing permission / 403.
[ ] 4.3 — unauthenticated / 401.
[ ] 4.4 — CSRF atau session expired / 419 jika berlaku.
[ ] 4.5 — rate limit / 429.
[ ] 4.6 — validation error / 422.
[ ] 4.7 — fresh-auth required / step-up required / MFA assurance required.
[ ] 4.8 — backend 5xx dengan safe error copy.
[ ] 4.9 — audit/correlation ID tampil atau tersimpan di state yang tepat bila backend mengirimkannya.
[ ] 4.10 — action tidak meninggalkan stale loading/disabled state setelah error.
```

Action destructive harus punya confirmation test:

```text
[ ] impact summary terlihat sebelum submit.
[ ] primary destructive button tidak aktif sebelum user confirmation valid.
[ ] cancel tidak memanggil API.
[ ] success state tidak menampilkan secret/PII berlebih.
```

---

## PHASE 5 — GOVERNANCE FEATURE SLICE CHECKLIST

Gunakan checklist ini untuk menentukan test minimal per domain.

### Dashboard — FR-050 / UC-52

```text
[ ] fetch dashboard summary via service.
[ ] loading, empty, error, success states.
[ ] permission DASHBOARD_VIEW / equivalent tested.
[ ] no raw metrics secret/token exposed.
```

### User lifecycle — FR-051, FR-022 / UC-50, UC-53–UC-56

```text
[ ] list/detail/create/update user.
[ ] lock/unlock, deactivate/reactivate.
[ ] password reset and MFA reset.
[ ] role assignment.
[ ] session termination.
[ ] destructive actions require confirmation and audit context.
```

### Client management — FR-006, FR-008–FR-012, FR-054 / UC-03–UC-09, UC-60–UC-61

```text
[ ] list/detail/edit client.
[ ] redirect URI exact-match UX.
[ ] post-logout URI UX.
[ ] scope/consent policy UX.
[ ] secret rotation one-time display.
[ ] suspend/decommission with token-impact warning.
```

### Audit and compliance — FR-044, FR-049, FR-052, FR-063 / UC-41–UC-42, UC-57–UC-59, UC-63, UC-65

```text
[ ] audit event list/detail.
[ ] authentication audit view.
[ ] integrity status.
[ ] export flow with permission and error handling.
[ ] correlation ID / request ID / SID / client ID search.
[ ] DSR review and evidence state.
```

### RBAC — FR-053 / UC-51, UC-56–UC-57, UC-73

```text
[ ] role list/detail.
[ ] permission matrix.
[ ] assign permissions to role.
[ ] assign roles to user.
[ ] missing-permission UI hidden/forbidden states.
```

### Security policy — FR-055 / UC-62, UC-68, UC-70

```text
[ ] policy versions list/detail.
[ ] create draft.
[ ] activate/rollback with step-up.
[ ] risk/impact summary before activation.
```

### External IdP — FR-057–FR-059 / UC-81–UC-82

```text
[ ] provider list/detail.
[ ] create/update provider config.
[ ] mapping preview.
[ ] health/failover/disable state.
```

### Ops and incident — FR-056, FR-063 / UC-75, UC-77–UC-83

```text
[ ] health/readiness surface.
[ ] runbook/evidence links.
[ ] SIEM/export evidence status if exposed.
[ ] backup/restore/JWKS/DR drill status if exposed.
[ ] IP allow/blocklist ownership clear if implemented.
```

---

## PHASE 6 — SENSITIVE DATA AND ONE-TIME SECRET CHECK

Admin UI akan mengelola data sensitif. Treat every screen as audit-sensitive.

```text
[ ] 6.1 — No token or secret in browser storage.
[ ] 6.2 — No token or secret in URL query/hash.
[ ] 6.3 — No token, secret, raw PII, or raw backend error in console logs.
[ ] 6.4 — One-time client secret plaintext is displayed once only.
[ ] 6.5 — Secret display has explicit warning and copy action test.
[ ] 6.6 — Secret is not stored in Pinia after modal/page closes unless backend contract explicitly permits masked value.
[ ] 6.7 — Screenshots/evidence docs redact secret/PII unless the user explicitly asks otherwise.
```

Hard stop examples:

```typescript
localStorage.setItem('admin_token', token)
console.log('rotated secret', secret)
router.push(`/clients/${clientId}?secret=${secret}`)
```

---

## PHASE 7 — OPERATIONAL EVIDENCE CHECK

Audit FR-001–FR-063 requires operational evidence, not only UI success.

For each admin feature, document whether it contributes to:

```text
[ ] backup/restore evidence pack
[ ] SIEM export verification
[ ] JWKS rotation drill
[ ] incident runbook exercise
[ ] DR/failover drill
[ ] audit export and integrity evidence
[ ] correlation ID / SID incident search
[ ] IP allow/blocklist management
[ ] security notification evidence
```

If not applicable, mark it explicitly in the implementation notes or PR summary.

---

## PHASE 8 — VERIFICATION COMMANDS

Before declaring DONE, run the relevant commands from `services/sso-admin-frontend`.

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

Run E2E when route/navigation/critical governance UI changes:

```bash
npm run test:e2e
```

If a command is blocked by environment/tooling, report exactly which command was blocked and why. Do not mark verification as passed.

---

## DONE SELF-CHECK TEMPLATE

Use this format before saying a task is complete.

```text
SSO Admin Frontend TDD Self-Check

Requirement / Audit Mapping:
- FR/UC:
- Audit gap:
- Backend endpoint:
- Permission:
- Action class:

TDD:
- RED observed:
- GREEN observed:
- Refactor done:

Security:
- Backend remains security boundary: PASS/FAIL
- Permission-aware UI: PASS/FAIL
- No browser token/secret storage: PASS/FAIL
- Same-origin API with credentials: PASS/FAIL

UX and Evidence:
- Loading/empty/error/forbidden states: PASS/FAIL
- Fresh-auth/MFA/step-up handling: PASS/FAIL/NA
- Audit/correlation evidence: PASS/FAIL/NA

Verification:
- typecheck:
- lint:
- format:check:
- test:
- e2e:
- build:

Final status: DONE / NOT DONE
```
