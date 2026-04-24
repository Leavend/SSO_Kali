# Laravel 13 + Vue Lifecycle Validation

Tanggal validasi: 2026-04-24

Status: Laravel 13 compatibility validated, Vue canary lifecycle intact

## Summary

Validasi lanjutan menutup target stack Laravel latest untuk dua aplikasi
Laravel di repo ini:

- `services/sso-backend` sekarang menargetkan `laravel/framework:^13.0`.
- `apps/app-b-laravel` sekarang menargetkan `laravel/framework:^13.0`.
- Tooling backend diselaraskan ke Pest 4, PHPUnit 12, Laravel Tinker 3, dan
  Pest Laravel plugin 4.
- Advisory `firebase/php-jwt <7.0.0` di App B ditutup dengan upgrade ke
  `firebase/php-jwt:^7.0`.
- Vue canary tetap pada jalur aman: Vue `3.5.33`, Vue Router `5.0.6`, Pinia
  `3.0.4`, dan route tetap isolated di `__vue-preview`.

## Zero-Downtime Position

Tidak ada perubahan schema destruktif yang ditambahkan pada validasi ini.
Perubahan bersifat dependency + test harness + deploy determinism, sehingga
rollout produksi tetap memakai urutan aman:

1. Build image dengan tag immutable.
2. Deploy `backend-only` atau `admin-vue-only` sesuai scope.
3. Jalankan smoke test per service.
4. Jika smoke gagal, `scripts/vps-deploy.sh` memanggil rollback ke tag
   sebelumnya.
5. Root admin tetap dilayani Next.js selama Vue berjalan sebagai canary.

## Rollback Mechanism

Rollback memakai `APP_IMAGE_TAG` yang sama dengan Compose image selection.
Custom image Compose yang tervalidasi:

- `sso-dev-sso-backend:${APP_IMAGE_TAG:-local}`
- `sso-dev-sso-frontend:${APP_IMAGE_TAG:-local}`
- `sso-dev-sso-admin-vue:${APP_IMAGE_TAG:-local}`
- `sso-dev-zitadel-login:${APP_IMAGE_TAG:-local}`
- `sso-dev-app-a-next:${APP_IMAGE_TAG:-local}`
- `sso-dev-app-b-laravel:${APP_IMAGE_TAG:-local}`

Rollback database tidak diperlukan untuk batch ini karena tidak ada migration
baru. Untuk batch berikutnya yang menyentuh database, gunakan expand / migrate /
contract dengan rollback window eksplisit.

## QA Evidence

Backend SSO:

```bash
composer validate --strict
composer audit
vendor/bin/pint --test
vendor/bin/phpstan analyse --level=5 --memory-limit=512M --no-progress
vendor/bin/pest
```

Hasil:

- Composer validate: pass.
- Composer audit: no advisory.
- Pint: pass.
- PHPStan/Larastan: pass.
- Pest: 208 pass, 2 skipped karena JWKS rotation mock harness tidak dikonfigurasi.

App B Laravel:

```bash
composer validate --strict
composer audit
vendor/bin/pint --test
vendor/bin/phpstan analyse --level=5 --memory-limit=512M --no-progress
vendor/bin/pest
```

Hasil:

- Composer validate: pass.
- Composer audit: no advisory.
- Pint: pass.
- PHPStan/Larastan: pass.
- Pest: 50 pass, 2 skipped karena JWKS rotation mock harness tidak dikonfigurasi.

Lifecycle validator:

```bash
./scripts/validate-laravel-vue-lifecycle.sh --strict-target
```

Hasil: 0 failure, 0 warning.

## Investigation Notes

Temuan penting selama upgrade:

- Pest 4 memuat file test lebih ketat, sehingga helper global App B yang
  bernama sama harus dibuat unik.
- Laravel 13 + Pest 4 membuat test HTTP di folder `Unit` tetap perlu database
  schema bila route middleware menulis audit event; test terkait diberi
  `RefreshDatabase`.
- Refresh token lokal mengikuti kontrak `offline_access`; test lifecycle yang
  mengharapkan refresh token sekarang meminta scope tersebut secara eksplisit.
- Default MFA admin aktif, sehingga test yang memvalidasi freshness/RBAC
  diisolasi dengan `sso.admin.mfa.enforced=false`; test MFA tetap memvalidasi
  enforcement aktif.
- Composer cache lokal sempat menyajikan arsip Symfony tidak lengkap untuk App
  B. Cache Composer dibersihkan, lalu `symfony/http-foundation` dan
  `symfony/var-dumper` di-reinstall sampai file vendor lengkap dan gate kembali
  pass.

## Next Lifecycle Step

Langkah berikutnya adalah staging rollout Laravel 13:

1. Build backend dan App B image dengan tag immutable.
2. Deploy `backend-only` terlebih dahulu.
3. Smoke endpoint health, OIDC discovery, `/token`, `/userinfo`, admin API, dan
   App B callback/logout.
4. Jika stabil, deploy App B Laravel image.
5. Pertahankan Vue canary di `__vue-preview` sampai auth BFF parity selesai.
