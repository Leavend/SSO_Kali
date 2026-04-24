# Laravel + Vue Zero-Downtime Validation

Tanggal validasi: 2026-04-24

Status: canary hardened, Laravel 13 compatibility validated

## Executive Summary

Validasi lanjutan menemukan bahwa arah arsitektur masih benar:

- Jangan cutover Next.js admin secara in-place.
- Pertahankan root admin di `services/sso-frontend`.
- Jalankan Vue pada canary path `__vue-preview`.
- Pindahkan BFF/auth ke Laravel hanya setelah contract dan smoke parity siap.

Perubahan hardening yang sudah dieksekusi pada validasi ini:

- `services/sso-admin-vue/package.json` sekarang punya script `typecheck` dan
  `test` agar cocok dengan generic frontend CI.
- `docker-compose.dev.yml` sekarang memberi image name eksplisit untuk service
  custom memakai `APP_IMAGE_TAG`.
- `scripts/vps-deploy.sh` dan `scripts/vps-rollback.sh` sekarang me-retag image
  GHCR ke nama image yang benar-benar dipakai Compose.
- `deploy-remote.sh` mode `full` sekarang ikut smoke Vue canary.
- `scripts/vps-deploy.sh` sekarang memakai Host header pada smoke test,
  mengecek Vue canary, dan memicu rollback jika smoke gagal.
- Gate baru tersedia di `scripts/validate-laravel-vue-lifecycle.sh`.
- `services/sso-backend` dan `apps/app-b-laravel` sekarang menargetkan Laravel
  13 dan lolos Composer validate/audit, Pint, PHPStan/Larastan, dan Pest.

## Official Baseline Checked

Sumber resmi yang dipakai:

- Laravel 13 release notes: https://laravel.com/docs/13.x/releases
- Vue release policy: https://vuejs.org/about/releases
- Vue core releases: https://github.com/vuejs/core/releases

Snapshot validasi:

- Laravel 13.x sudah rilis stabil.
- Laravel 13 membutuhkan PHP minimal 8.3; project sudah memakai PHP `^8.4`.
- Laravel 12 masih mendapat bug fixes sampai 2026-08-13 dan security fixes
  sampai 2027-02-24, sehingga compatibility bridge masih aman untuk canary.
- Vue stable pada lockfile canary adalah `3.5.33`.
- Vue `3.6.0-beta.10` masih pre-release, sehingga tidak masuk production SSO.

## Current Project Evidence

Laravel:

- `services/sso-backend/composer.json` memakai `laravel/framework:^13.0`.
- `apps/app-b-laravel/composer.json` memakai `laravel/framework:^13.0`.
- Tooling test sudah kompatibel dengan Pest 4 / PHPUnit 12.
- App B memakai `firebase/php-jwt:^7.0` untuk menutup advisory pada jalur
  `firebase/php-jwt <7.0.0`.

Vue:

- `services/sso-admin-vue/package-lock.json` memuat:
  - Vue `3.5.33`
  - Vue Router `5.0.6`
  - Pinia `3.0.4`
- `npm run typecheck`, `npm run test`, `npm run lint`, dan `npm run build`
  sudah lulus setelah alias CI ditambahkan.

Deployment:

- `sso-admin-vue` tetap isolated pada path canary.
- Backend/OIDC/Admin API router tetap prioritas 200.
- Vue canary router prioritas 175.
- Next.js admin root catch-all tetap prioritas 50.

## Lifecycle Gates

### Gate 1 - Contract Freeze

Status: partial.

Kontrak admin API sudah tersebar di docs/contracts, tetapi auth BFF parity untuk
`/auth/login`, `/auth/callback`, `/auth/refresh`, dan `/auth/logout` harus
dibekukan sebelum Laravel BFF mengambil alih flow dari Next.js.

Exit criteria:

- Contract test untuk route auth admin tersedia.
- Behavior session cookie, callback error, MFA, access denied, dan logout
  terdokumentasi.
- Next.js root tetap menjadi rollback target.

### Gate 2 - Laravel 13 Compatibility

Status: validated.

Project sudah memenuhi target Laravel 13 pada backend SSO dan App B. Upgrade
dependency selesai tanpa migration baru, sehingga rollback image masih cukup
untuk batch ini. Gate yang lulus:

1. `composer validate --strict`
2. `composer audit`
3. `vendor/bin/pint --test`
4. `vendor/bin/phpstan analyse --level=5 --memory-limit=512M --no-progress`
5. `vendor/bin/pest`

### Gate 3 - Vue Canary

Status: ready as isolated canary.

Vue canary tidak mengganti root traffic. Static runtime memakai Nginx
unprivileged dan healthcheck `/healthz`. Deployment canary bisa dilakukan via:

```bash
./scripts/deploy.sh --mode admin-vue-only
```

### Gate 4 - Zero-Downtime Update

Status: hardened.

Sebelum hardening, CD menarik image GHCR tetapi tidak punya jaminan bahwa image
tersebut adalah image yang dipakai oleh Compose. Sekarang custom services
punya image eksplisit:

```text
sso-dev-sso-backend:${APP_IMAGE_TAG:-local}
sso-dev-sso-frontend:${APP_IMAGE_TAG:-local}
sso-dev-sso-admin-vue:${APP_IMAGE_TAG:-local}
sso-dev-zitadel-login:${APP_IMAGE_TAG:-local}
sso-dev-app-a-next:${APP_IMAGE_TAG:-local}
sso-dev-app-b-laravel:${APP_IMAGE_TAG:-local}
```

CD dan rollback mengekspor `APP_IMAGE_TAG="$TAG"` sebelum menjalankan Compose.

### Gate 5 - Rollback Mechanism

Status: hardened.

Rollback image sekarang memakai tag yang sama dengan Compose image selection.
Smoke failure pada `scripts/vps-deploy.sh` tidak lagi hanya warning; failure
akan memanggil `vps-rollback.sh` jika previous tag tersedia.

## Validation Commands

Command yang sudah dijalankan:

```bash
bash -n scripts/validate-laravel-vue-lifecycle.sh scripts/vps-deploy.sh scripts/vps-rollback.sh deploy-remote.sh scripts/deploy.sh
./scripts/validate-laravel-vue-lifecycle.sh --strict-target
npm run typecheck
npm run test
npm run lint
npm run build
composer validate --strict
composer audit
vendor/bin/pint --test
vendor/bin/phpstan analyse --level=5 --memory-limit=512M --no-progress
vendor/bin/pest
```

Hasil:

- Bash syntax: pass.
- Lifecycle gate: 0 failure, 0 warning.
- Backend SSO Pest: 208 pass, 2 skipped karena JWKS rotation harness eksternal
  tidak dikonfigurasi.
- App B Pest: 50 pass, 2 skipped karena JWKS rotation harness eksternal tidak
  dikonfigurasi.
- Vue typecheck/test/lint/build: pass.
- Docker Compose runtime validation belum dijalankan di mesin ini karena Docker
  Compose plugin tidak tersedia.

## Recommended Next Step

Lanjutkan dengan staging rollout Laravel 13:

1. Build image immutable untuk backend SSO dan App B.
2. Deploy `backend-only`, lalu smoke health, discovery, token, userinfo, admin
   API, dan App B callback/logout.
3. Jika smoke gagal, rollback image ke previous tag.
4. Baru setelah Laravel 13 stabil di staging, lanjutkan auth BFF parity dari
   Next.js ke Laravel.
