# Laravel + Vue Target Stack Transition Audit

Tanggal audit: 2026-04-24

Status: migration blueprint

Tujuan: mengubah arah `services/sso-backend` dan `services/sso-frontend`
menuju Laravel latest + Vue latest tanpa downtime, tanpa kehilangan rollback
path, dan tanpa merusak OIDC / SSO flow yang sudah stabil.

## Executive Decision

Jangan mengganti Next.js ke Vue secara in-place.

`services/sso-frontend` saat ini bukan sekadar UI statis. Service ini
memegang route handler auth seperti `/auth/login`, `/auth/callback`,
session cookie, token exchange, JWKS verification, dan admin bootstrap.
Menghapus Next.js tanpa replacement boundary akan memutus login admin.

Rute aman adalah parallel replacement:

1. Upgrade backend ke Laravel latest pada jalur kompatibilitas.
2. Bangun Vue control-plane baru secara paralel.
3. Jalankan dual-run di balik proxy.
4. Cutover trafik setelah smoke test dan parity checklist lulus.
5. Simpan Next.js image/container lama sebagai rollback target sampai masa
   stabilisasi selesai.

## Verified Latest Baseline

Sumber resmi yang dicek:

- Laravel 13.x release notes: https://laravel.com/docs/13.x/releases
- Vue release cycle: https://vuejs.org/about/releases
- Vue core releases: https://github.com/vuejs/core/releases

Snapshot pada 2026-04-24:

- Laravel latest major: Laravel 13.x.
- Current backend repo: Laravel 12, PHP `^8.4`, Octane, Larastan, Pest.
- Vue latest production-safe line: Vue 3.5.x stable.
- Vue 3.6.x masih beta, jadi tidak disarankan untuk production SSO.
- Current frontend repo: Next.js 16.2.2 + React 19.2.4.

## Current Source Findings

Backend:

- `services/sso-backend/composer.json` memakai `laravel/framework:^12.0`.
- PHP sudah modern: `^8.4`.
- Paket enterprise sudah ada: Octane, Predis, Larastan, Pint, Telescope, Pest.
- Worker queue sudah dipisahkan sebagai `sso-backend-worker`.
- CI sudah menjalankan Pint, PHPStan level 5, Pest, dan Docker build.

Frontend:

- `services/sso-frontend/package.json` memakai Next.js App Router.
- Route handler auth ada di `src/app/auth/login/route.ts`.
- Callback OIDC ada di `src/app/auth/callback/route.ts`.
- Admin status pages dan dashboard berada di App Router tree.
- Tidak ada dependensi Vue pada service ini.

Deployment:

- `scripts/deploy.sh` sudah mendukung mode `full`, `backend-only`,
  `frontend-only`, dan `queue-only`.
- `deploy-remote.sh` melakukan rebuild service terpilih dan smoke test.
- GitHub Actions sudah punya CI/CD image pipeline dan rollback workflow.
- Compose sudah mendefinisikan `sso-backend`, `sso-backend-worker`,
  `sso-frontend`, ZITADEL, Redis, PostgreSQL, dan Traefik.

## Target Architecture Options

### Option A: Laravel Backend + Vue SPA Service

Bangun service baru, contoh `services/sso-admin-vue`, memakai:

- Vue 3.5 stable
- Vite latest stable
- TypeScript strict
- Vue Router
- Pinia atau TanStack Query untuk state/query layer
- Vitest
- Playwright
- ESLint
- TailwindCSS 4 atau design tokens existing

Konsekuensi:

- Butuh BFF server-side untuk `/auth/login`, `/auth/callback`, session cookie,
  refresh, dan logout.
- Vue SPA tidak boleh menyimpan token sensitif di browser storage.
- Jika BFF tetap Next, stack target belum benar-benar pindah dari Next.

### Option B: Laravel 13 Control Plane + Vue via Vite

Laravel menjadi backend sekaligus BFF/admin control-plane. Vue menjadi UI
yang di-build oleh Vite dan dilayani Laravel.

Konsekuensi:

- Paling selaras dengan target "Laravel Advanced Latest + VueJs Latest".
- Auth callback, cookie, CSRF, session, dan admin API berada di satu trust
  boundary Laravel.
- Risiko migrasi lebih terkendali karena security-sensitive flow berpindah ke
  PHP server-side, bukan SPA-only.
- Perlu parallel service/path selama migrasi supaya zero downtime tetap
  tercapai.

### Recommendation

Pilih Option B sebagai target final, tetapi eksekusi dengan parallel service:

- Current service tetap `services/sso-frontend` sampai cutover.
- Buat `services/sso-admin-vue` atau `services/sso-control-plane`.
- Laravel 13 BFF menyajikan Vue shell dan menangani route auth admin.
- Proxy dapat mengarahkan canary host/path ke service baru.

## Software Lifecycle Plan

### Phase 0: Contract Freeze

Tujuan:

- Bekukan kontrak endpoint admin.
- Dokumentasikan cookie/session semantics.
- Buat parity checklist antara Next admin dan Vue admin.

Deliverables:

- OpenAPI atau contract markdown untuk `/admin/api/*`.
- Auth state machine untuk login, callback, refresh, logout, session expired,
  MFA required, access denied, handshake failed.
- Smoke test baseline untuk current Next service.

Exit criteria:

- Current production tetap unchanged.
- Semua behavior kritikal terdokumentasi sebelum migrasi.

### Phase 1: Laravel Latest Compatibility Track

Tujuan:

- Upgrade backend dari Laravel 12 ke Laravel 13 di branch terpisah.
- Tidak melakukan perubahan skema destruktif.

Langkah:

- Update constraint `laravel/framework` ke `^13.0`.
- Jalankan `composer update` terarah.
- Audit breaking changes Laravel 13.
- Jalankan Pint, Larastan level 5, Pest, migration test, dan smoke test.

Zero downtime:

- Pakai expand-only migrations.
- Jangan drop kolom, rename kolom, atau mengubah enum secara destruktif.
- Deploy backend dengan `docker compose up -d --no-deps --build sso-backend
  sso-backend-worker`.

Rollback:

- Simpan image/tag Laravel 12 terakhir.
- Skema database harus tetap backward-compatible dengan Laravel 12 sampai
  stabilisasi selesai.

### Phase 2: Vue Admin Parallel Build

Tujuan:

- Bangun admin UI Vue tanpa menyentuh trafik utama.

Langkah:

- Tambahkan service paralel, misalnya `services/sso-admin-vue`.
- Implementasikan UI dari route yang paling aman:
  dashboard read-only, status pages, user list, session list.
- Reimplementasi auth BFF hanya setelah contract dan smoke test siap.

Zero downtime:

- Route awal di host/path canary, misalnya `vue.dev-sso.timeh.my.id` atau
  `dev-sso.timeh.my.id/__vue-preview`.
- No production traffic by default.

Rollback:

- Hapus route canary dari proxy; service lama tetap melayani trafik utama.

### Phase 3: Dual-Run / Canary

Tujuan:

- Validasi Vue control-plane dengan trafik terbatas.

Langkah:

- Tambahkan Traefik router eksplisit untuk canary.
- Jalankan synthetic login journey.
- Bandingkan telemetry:
  login started, callback success, admin API success, refresh success,
  logout success, error boundaries.

Zero downtime:

- Cutover dilakukan lewat proxy rule, bukan mematikan service lama.
- Next service tetap running selama canary.

Rollback:

- Kembalikan Traefik priority/host rule ke Next service.
- Tidak perlu restore database jika kontrak backward-compatible dijaga.

### Phase 4: Production Cutover

Tujuan:

- Pindahkan trafik utama admin dari Next ke Laravel+Vue.

Langkah:

- Freeze deployment window singkat.
- Jalankan preflight.
- Start service baru.
- Smoke internal.
- Switch proxy.
- Smoke external.
- Monitor logs dan metrics selama minimal 60 menit.

Zero downtime:

- Service baru harus healthy sebelum proxy switch.
- Service lama tetap hidup sampai post-cutover checks lulus.

Rollback:

- Revert proxy rule ke `sso-frontend`.
- Jalankan smoke `https://dev-sso.timeh.my.id/`.
- Keep image/tag lama minimal satu release cycle.

### Phase 5: Decommission Next

Tujuan:

- Hapus Next hanya setelah Vue stabil.

Exit criteria:

- Dua deployment beruntun tanpa rollback.
- Tidak ada peningkatan auth error rate.
- Semua e2e login/logout/refresh lulus di CI.
- Runbook rollback masih valid.

## Required Engineering Guardrails

Security:

- Vue SPA tidak menyimpan access token, refresh token, atau ID token di
  `localStorage`, `sessionStorage`, atau IndexedDB.
- Callback dan token exchange tetap server-side.
- Session cookie harus `HttpOnly`, `Secure`, `SameSite=Lax` atau lebih ketat
  sesuai flow.
- Semua endpoint mutating memakai CSRF atau origin validation yang relevan.

Reliability:

- Healthcheck harus tersedia pada service baru.
- Queue worker dan backend tetap dipisahkan.
- Redis degradation tetap fail-safe.
- ZITADEL tetap source of truth untuk authentication.

Quality:

- PHP: `declare(strict_types=1);`, Larastan level 5, Pest.
- Vue/TS: strict mode, no `any`, Vitest, Playwright.
- File baru dijaga di bawah 500 baris.
- Function baru dijaga di bawah 20 baris.

Observability:

- Log structured untuk auth success/failure.
- Smoke tests harus memverifikasi login page, callback failure page, dashboard,
  `/admin/api/me`, and logout.
- Deployment harus menghasilkan evidence: image tag, git SHA, smoke result,
  rollback tag.

## Concrete Rollout Mechanics

Development branch:

```bash
git checkout -b feat/laravel13-vue-control-plane
```

Backend compatibility:

```bash
cd services/sso-backend
composer require laravel/framework:^13.0 --update-with-all-dependencies
vendor/bin/pint --test
vendor/bin/phpstan analyse --level=5 --memory-limit=512M --no-progress
vendor/bin/pest --no-interaction
```

Vue scaffold target:

```bash
npm create vue@latest services/sso-admin-vue
```

Production-safe deployment pattern:

```bash
./scripts/deploy.sh --mode backend-only
./scripts/deploy.sh --mode frontend-only
```

For the Vue cutover phase, add a new mode instead of overloading
`frontend-only`:

```bash
./scripts/deploy.sh --mode admin-vue-only
```

## Risk Register

High risk:

- Replacing Next before callback/session parity is implemented.
- Moving token exchange into browser-side Vue.
- Laravel 13 dependency incompatibility with Telescope, Octane, Pest, or
  project-specific middleware.

Medium risk:

- Cookie domain/path mismatch during dual-run.
- Inconsistent redirect URI between ZITADEL, Laravel, and proxy.
- Proxy priority conflict between `sso-frontend` and new Vue route.

Low risk:

- Dashboard visual migration.
- Static status pages migration.
- Read-only admin lists if API contract is stable.

## Final Recommendation

Treat this as a controlled platform migration, not a cosmetic frontend rewrite.

The safest target is Laravel 13 as the control-plane/BFF with Vue 3.5 stable as
the admin UI layer. Keep Next.js alive until the Vue control-plane proves parity
through automated smoke tests, then cut over via proxy with a one-command
rollback to the current Next.js service.
