# Prototype SSO System

Prototype ini membangun Single Sign-On berbasis OIDC/OAuth 2.1 dengan ZITADEL sebagai identity engine, Laravel sebagai OIDC facade, Next.js sebagai login portal, dan dua dummy app untuk uji integrasi browser-side serta server-side.

## Status Fase

- Phase 1 selesai: struktur monorepo, boilerplate service/app, strict typing, docker-compose, Helm scaffold, dan dokumentasi awal.
- Phase 2 selesai: endpoint OIDC lokal aktif di Laravel, broker flow ke ZITADEL, JWKS, refresh token rotation, `userinfo`, `revocation`, dan resource profile API.
- Phase 3 selesai: App A dan App B sudah menjalankan login callback end-to-end, menyimpan sesi lokal server-side, mendaftarkan sesi ke backend, dan menerima back-channel logout lintas aplikasi.
- Phase 4 selesai: deployment dev server, HTTPS publik, reverse proxy nginx, dan ZITADEL bootstrap.

Catatan penting:
- daftar di atas adalah baseline awal proyek, bukan seluruh riwayat terkini
- audit timeline terbaru yang diturunkan dari source tree ada di `docs/generated/project-road-timeline-audit-2026-04-24.md`
- audit fokus DevOps dan prioritas integrasi minggu ini ada di `docs/generated/devops-focus-roadmap-2026-04-24.md`
- audit target migrasi Laravel latest + Vue latest ada di `docs/generated/laravel-vue-target-stack-transition-audit-2026-04-24.md`
- runbook integrasi canary Vue ada di `docs/generated/laravel-vue-canary-integration-runbook-2026-04-24.md`

## Komponen

- `services/sso-backend`: Laravel 12 untuk discovery, `/authorize`, `/token`, `/userinfo`, `/jwks`, `/revocation`, session registration, centralized logout, dan profile resource API.
- `services/sso-frontend`: Next.js App Router untuk portal login dan visualisasi user journey.
- `services/sso-admin-vue`: Vue 3 + Vite canary control-plane untuk migrasi bertahap menuju Laravel latest + Vue latest.
- `apps/app-a-next`: Dummy public client berbasis Next.js dengan PKCE, Redis-backed local session, dan endpoint `/api/backchannel/logout`.
- `apps/app-b-laravel`: Dummy confidential client berbasis Laravel dengan server-side callback, database session, dan endpoint `/auth/backchannel/logout`.

Catatan arah stack:
- runtime saat ini tetap Laravel 12 + Next.js sampai cutover resmi
- target migration path adalah Laravel latest sebagai control-plane/BFF dengan Vue latest stable sebagai UI admin
- migrasi dilakukan paralel supaya zero downtime, rollback, dan update zero downtime tetap terjaga

## Deployment Dev (VPS)

### Fast Deploy (lokal -> VPS, satu perintah)

```bash
cd /Users/leavend/Desktop/Project_SSO

./scripts/deploy.sh --mode full
./scripts/deploy.sh --mode backend-only
./scripts/deploy.sh --mode frontend-only
./scripts/deploy.sh --mode admin-vue-only
./scripts/deploy.sh --mode queue-only
```

Workflow ini mengikuti pola cepat seperti `github_angga`:

1. sync source via `rsync`
2. eksekusi `deploy-remote.sh` di VPS
3. rebuild hanya service yang relevan
4. jalankan task pasca-deploy yang diperlukan
5. smoke test otomatis sesuai mode

Gunakan mode ini saat Anda deploy dari laptop ke VPS dan ingin jalur yang lebih deterministik tanpa menjalankan langkah manual satu per satu.

### Quick Deploy (satu perintah)

```bash
cd /opt/sso-prototype-dev
sudo ./deploy-full.sh --skip-build   # pakai image yang sudah ada
# atau
sudo ./deploy-full.sh                # build ulang semua image
```

Script ini menjalankan tiga fase:

1. **Deploy** — build image, start dependencies, migrate database, bawa semua service up.
2. **Bootstrap ZITADEL** — buat project `Prototype SSO Dev`, broker OIDC app, test user, dan update `.env.dev` dengan credential yang benar.
3. **Verify** — cek HTTPS keempat domain dan status Docker.

### Manual Deploy (step by step)

```bash
# 1. Deploy stack
sudo ./deploy-dev.sh --skip-build

# 2. Bootstrap ZITADEL (buat broker app + test user)
sudo bash ./infra/zitadel/bootstrap-dev-resources.sh

# 3. Verify
curl -sS https://dev-sso.timeh.my.id/.well-known/openid-configuration | jq .issuer
curl -sS https://id.dev-sso.timeh.my.id/.well-known/openid-configuration | jq .issuer
curl -I https://app-a.timeh.my.id/
curl -I https://app-b.timeh.my.id/
```

### Reseed ZITADEL (reset total)

Jika perlu reset ZITADEL dari nol (hapus semua data IAM):

```bash
sudo bash ./infra/zitadel/reseed-dev-instance.sh
sudo ./deploy-full.sh --skip-build
```

### Domain Dev

| Domain | Service | Purpose |
|---|---|---|
| `dev-sso.timeh.my.id` | SSO Backend (Laravel) | OIDC facade, broker, resource API |
| `id.dev-sso.timeh.my.id` | ZITADEL | Identity engine, login UI |
| `app-a.timeh.my.id` | App A (Next.js) | Dummy public client |
| `app-b.timeh.my.id` | App B (Laravel) | Dummy confidential client |

### Test User

| Field | Value |
|---|---|
| Username | `dev@timeh.my.id` |
| Password | Set explicitly during bootstrap or rotate with `infra/zitadel/reset-dev-admin-password.sh` |

## Setup Lokal

1. Salin environment lalu bootstrap file `.env` masing-masing service:

```bash
cp .env.example .env
make bootstrap
```

2. Jalankan seluruh stack:

```bash
docker compose --env-file .env up --build
```

3. Buat broker client di ZITADEL untuk Laravel SSO backend:

- Buka `http://localhost:8080/ui/console`
- Buat web application untuk broker Laravel
- Daftarkan redirect URI `http://localhost:8200/callbacks/zitadel`
- Simpan `client_id` dan `client_secret`, lalu isi `ZITADEL_BROKER_CLIENT_ID` dan `ZITADEL_BROKER_CLIENT_SECRET` di root `.env`
- Restart stack setelah broker credential diperbarui

4. Akses service lokal:

- ZITADEL proxy: `http://localhost:8080`
- SSO Frontend: `http://localhost:3000`
- App A Next.js: `http://localhost:3001`
- SSO Backend Laravel: `http://localhost:8200`
- App B Laravel: `http://localhost:8300`

## User Journey Phase 3

1. User membuka App A atau App B.
2. Client mengarahkan user ke `GET /authorize` pada Laravel SSO backend dengan Authorization Code Flow + PKCE.
3. Laravel mem-broker request ke ZITADEL, lalu callback upstream masuk ke `GET /callbacks/zitadel`.
4. Laravel menerbitkan local authorization code, dan client menukarnya di `POST /token`.
5. App A menyimpan sesi lokal di Redis; App B menyimpan sesi lokal di database session Laravel.
6. Kedua app mendaftarkan partisipasi sesi ke `POST /connect/register-session`.
7. Client memuat profile sinkron dari `GET /api/profile` dan menampilkan `sid`, risk score, serta status adaptive MFA.
8. Saat logout dilakukan dari salah satu app, client memanggil `POST /connect/logout`.
9. Laravel me-revoke seluruh token lokal pada `sid` tersebut lalu mengirim signed back-channel logout token ke App A dan App B.
10. App yang menerima logout token memutus semua sesi lokal yang terindeks pada `sid` yang sama.

## Endpoint Aktif

- `GET /.well-known/openid-configuration`
- `GET /authorize`
- `POST /token`
- `GET /userinfo`
- `GET /jwks`
- `POST /revocation`
- `POST /connect/register-session`
- `POST /connect/logout`
- `GET /callbacks/zitadel`
- `GET /api/profile`

## Verifikasi

```bash
cd services/sso-backend && php artisan test
cd services/sso-backend && vendor/bin/phpstan analyse --memory-limit=512M

cd apps/app-b-laravel && php artisan test
cd apps/app-b-laravel && vendor/bin/phpstan analyse --memory-limit=512M

cd apps/app-a-next && npm run lint
cd apps/app-a-next && npm run typecheck
cd apps/app-a-next && npm run build
```

## Catatan Implementasi

- ZITADEL tetap menjadi source of truth untuk autentikasi, MFA, brute-force protection, dan session pusat.
- Laravel backend menerbitkan token lokal ES256 dan mempublikasikan public key lewat `/jwks`.
- Logical `sid` dipertahankan lintas client agar back-channel logout bisa menyapu App A dan App B dalam satu sesi SSO.
- Root `.env` dipakai untuk runtime Docker Compose, jadi beberapa URL internal memakai hostname container seperti `sso-backend` atau `app-a-next`.
- Bootstrap ZITADEL dev resources dilakukan via `bootstrap-dev-resources.sh` yang idempotent dan otomatis meng-update `.env.dev`.
