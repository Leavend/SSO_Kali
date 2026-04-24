# Laravel + Vue Canary Integration Runbook

Tanggal eksekusi: 2026-04-24

Status: canary integration ready

## Scope

Runbook ini mencatat integrasi awal target stack Laravel latest + Vue latest
berdasarkan audit `laravel-vue-target-stack-transition-audit-2026-04-24.md`.

Perubahan yang sudah dieksekusi:

- service baru `services/sso-admin-vue`
- Vue 3 + Vite + TypeScript strict
- Pinia, Vue Router, Vitest, Playwright, ESLint, Prettier
- Docker static runtime berbasis Nginx unprivileged
- Traefik canary route di `https://dev-sso.timeh.my.id/__vue-preview`
- deploy mode baru `admin-vue-only`
- CI matrix untuk test/build/image `sso-admin-vue`

Update validasi lanjutan:

- `sso-admin-vue` punya alias `typecheck` dan `test` agar cocok dengan CI
  frontend matrix.
- Custom service images di Compose memakai `APP_IMAGE_TAG` agar deploy dan
  rollback VPS memakai image yang tepat.
- Full remote deploy sekarang ikut smoke path Vue canary.
- VPS smoke failure sekarang memicu rollback, bukan hanya warning.
- Gate lifecycle baru tersedia:

```bash
./scripts/validate-laravel-vue-lifecycle.sh
```

Update Laravel 13 lifecycle:

- `services/sso-backend` dan `apps/app-b-laravel` sudah target Laravel 13.
- Batch upgrade tidak menambah migration baru, sehingga rollback image cukup
  untuk batch ini.
- QA Laravel lulus: Composer validate/audit, Pint, PHPStan/Larastan, dan Pest.
- Detail evidence tercatat di
  `docs/generated/laravel13-vue-lifecycle-validation-2026-04-24.md`.

## Zero-Downtime Principle

Service Vue tidak mengganti `services/sso-frontend`.

Trafik live tetap dilayani Next.js di root domain:

```text
https://dev-sso.timeh.my.id/
```

Vue canary berjalan pada path terisolasi:

```text
https://dev-sso.timeh.my.id/__vue-preview
```

Traefik memakai `StripPrefix` agar static assets Vite tetap resolve dengan
benar walaupun browser mengakses app melalui path canary.

## Deploy Commands

Deploy hanya service Vue canary:

```bash
./scripts/deploy.sh --mode admin-vue-only
```

Deploy full stack tetap tersedia:

```bash
./scripts/deploy.sh --mode full
```

Backend, frontend lama, dan worker tetap bisa di-rollout terpisah:

```bash
./scripts/deploy.sh --mode backend-only
./scripts/deploy.sh --mode frontend-only
./scripts/deploy.sh --mode queue-only
```

## Rollback Mechanism

Rollback tercepat untuk canary:

1. Hentikan route canary dengan menghapus atau menonaktifkan router
   `sso-admin-vue`.
2. Trafik root tidak terdampak karena tetap berada di `sso-frontend`.
3. Untuk rollback image di pipeline release, jalankan workflow rollback yang
   sudah memanggil `scripts/vps-rollback.sh`.

Rollback tidak membutuhkan restore database karena canary Vue saat ini tidak
melakukan migration dan tidak menulis state server.

## Update Zero-Downtime

Update Vue canary memakai lifecycle berikut:

1. Build image baru.
2. Start container `sso-admin-vue` dengan `docker compose up -d --no-deps`.
3. Tunggu healthcheck `/healthz`.
4. Smoke test path canary.
5. Jika gagal, rollback image tanpa menyentuh root admin panel.

Smoke target:

```bash
curl -ksS -o /dev/null -w '%{http_code}\n' \
  https://dev-sso.timeh.my.id/__vue-preview/healthz
```

Expected result:

```text
200
```

## Quality Gates

Local gates yang sudah dijalankan:

- `./scripts/validate-laravel-vue-lifecycle.sh`
- `npm run type-check`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit -- --run`
- `npm run test`
- `npm run build`
- `npm run format:check`
- `npm run test:e2e -- --project=chromium`
- YAML parse validation untuk `docker-compose.dev.yml`
- `bash -n` untuk deploy scripts

Docker compose runtime validation belum bisa dijalankan di mesin lokal ini
karena Docker Compose plugin tidak tersedia dan Docker daemon/Colima tidak
aktif. Validasi final runtime dilakukan di VPS melalui mode:

```bash
./scripts/deploy.sh --mode admin-vue-only
```

## Next Integration Step

Langkah berikutnya adalah memindahkan route auth admin dari Next.js ke Laravel
BFF secara bertahap:

1. Buat contract test untuk `/auth/login`, `/auth/callback`, `/auth/refresh`,
   dan `/auth/logout`.
2. Implementasi Laravel BFF route dalam mode disabled-by-default.
3. Jalankan canary callback URI baru di ZITADEL.
4. Cutover hanya setelah parity test lulus.
