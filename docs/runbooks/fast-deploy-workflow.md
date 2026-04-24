# Fast Deploy Workflow

Workflow ini membawa pola deploy cepat ala `github_angga` ke `Project_SSO` dengan dua entry point:

- local launcher: [scripts/deploy.sh](/Users/leavend/Desktop/Project_SSO/scripts/deploy.sh)
- remote executor: [deploy-remote.sh](/Users/leavend/Desktop/Project_SSO/deploy-remote.sh)

## Tujuan

- menghindari langkah manual berulang
- menjaga deploy tetap deterministik
- rebuild hanya service yang relevan
- menyediakan smoke test sesuai mode deploy

## Mode

### `full`

Untuk deploy terpadu stack aplikasi yang biasa berubah:

- `zitadel-login`
- `sso-backend`
- `sso-backend-worker`
- `sso-frontend`
- `app-a-next`
- `app-b-laravel`

Mode ini tetap memakai [deploy-dev.sh](/Users/leavend/Desktop/Project_SSO/deploy-dev.sh) sebagai jalur penuh yang sudah terbukti, lalu memastikan worker queue ikut aktif.
Sesudah deploy penuh, launcher lokal juga menjalankan:

- smoke validation untuk hosted login `id.dev-sso.timeh.my.id` agar copy, judul, dan dropdown bahasa tetap terkunci ke `Bahasa Indonesia` dan `English`
- responsive validation untuk memastikan card login tidak overflow di iPhone SE, iPad Mini, dan desktop
- theme-toggle validation untuk memastikan `light/dark` bawaan ZITADEL tetap berfungsi dan benar-benar mengganti state visual
- language-toggle validation untuk memastikan perpindahan `id -> en -> id` benar-benar memperbarui copy tanpa perlu refresh manual

### `backend-only`

Untuk patch broker, middleware, migration, queue, policy, dan command backend:

- rebuild `sso-backend`
- rebuild `sso-backend-worker`
- jalankan migration
- refresh cache Laravel
- smoke test discovery dan `/admin/api/me`

### `frontend-only`

Untuk patch `sso-frontend` saja:

- rebuild `sso-frontend`
- smoke test landing page dan `/auth/login`

### `queue-only`

Untuk maintenance worker queue:

- rebuild `sso-backend-worker`
- verifikasi proses `queue:work`

## Contoh Pemakaian

```bash
cd /Users/leavend/Desktop/Project_SSO

./scripts/deploy.sh --mode full
./scripts/deploy.sh --mode backend-only
./scripts/deploy.sh --mode frontend-only
./scripts/deploy.sh --mode queue-only
```

Jika Anda memang hanya ingin rollout tanpa smoke browser lokal, gunakan:

```bash
./scripts/deploy.sh --mode full --skip-hosted-login-smoke
```

Untuk melewati pemeriksaan responsif browser:

```bash
./scripts/deploy.sh --mode full --skip-hosted-login-responsive
```

Untuk melewati validasi toggle tema:

```bash
./scripts/deploy.sh --mode full --skip-hosted-login-theme-toggle
```

Untuk melewati validasi perpindahan bahasa interaktif:

```bash
./scripts/deploy.sh --mode full --skip-hosted-login-language-toggle
```

## Preflight Aman

Jalur ini bisa divalidasi tanpa menyentuh runtime live:

```bash
./scripts/deploy.sh --mode backend-only --preflight-only
```

## Prinsip Operasional

- local wrapper melakukan `rsync` source final ke VPS
- VPS tidak mengandalkan `git pull`
- executor remote memvalidasi compose sebelum deploy
- service hanya direcreate jika memang masuk scope mode deploy
- smoke test dijalankan otomatis setelah deploy selesai
- hosted login smoke memeriksa dua locale final yang diizinkan, yaitu `id` dan `en`
- hosted login responsive check memverifikasi viewport `iphone-se`, `ipad-mini`, dan `desktop`
- hosted login theme toggle check memverifikasi `cp-theme=light/dark` dan perubahan visual antar tema
- hosted login language toggle check memverifikasi switch `Bahasa Indonesia <-> English` tetap sinkron secara live
