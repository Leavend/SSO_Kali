# Client Integration Runbook RFC 7642

Tanggal validasi: 2026-04-28

## Prinsip

RFC 7642 adalah dokumen use case SCIM untuk identity management lintas domain. Untuk integrasi aplikasi client baru, dokumen ini paling relevan sebagai checklist provisioning, attribute sharing, trust agreement, audit, dan account lifecycle. Registrasi OAuth/OIDC client tetap dikelola oleh broker SSO, sementara SCIM atau just-in-time provisioning dipakai untuk sinkronisasi identitas.

Pola SSO multi-client yang dipakai produk besar seperti Google dapat diterapkan ke project ini dengan batas yang jelas: satu identity authority, redirect URI eksak per aplikasi, authorization code flow, refresh token server-side, session cookie HttpOnly Secure per client, silent SSO untuk mengecek sesi pusat, dan back-channel logout untuk memutus sesi semua client berdasarkan `sid`. Client tidak boleh menyimpan token di browser storage dan tidak boleh membuat trust ke upstream identity provider langsung; semua client tetap berbicara ke broker SSO internal.

## Jalur Aplikasi Live / Existing

1. Petakan domain, owner, redirect URI, logout URI, data owner, atribut minimum, dan terms/consent yang berlaku.
2. Daftarkan client dengan redirect allowlist eksak. Public client wajib PKCE; confidential client wajib secret server-side dan secret vault.
3. Mulai dengan just-in-time profile bila hanya butuh login. Gunakan SCIM bila perlu create, update, deactivate, atau group sync.
4. Jalankan canary untuk admin/tester, validasi callback, refresh, back-channel logout, audit log, dan alert.
5. Cutover bertahap. Rollback dengan menonaktifkan client toggle atau mengembalikan route ke autentikasi lama.

## Jalur Aplikasi Development

1. Buat client dev terpisah dengan redirect URI dev dan sample user.
2. Implementasikan authorization code flow, validasi state/nonce, dan session cookie HttpOnly Secure.
3. Sambungkan refresh rotation, idle timeout, absolute timeout, dan back-channel logout berbasis `sid`.
4. Promosikan ke live hanya setelah typecheck, test, scanner, health check, audit log, dan smoke test hijau.

## Guardrail

- Zero downtime: live auth lama tetap tersedia sampai SSO client lulus canary.
- Rollback: client toggle, route flag, dan tag image release harus bisa dikembalikan tanpa migrasi data destruktif.
- Update zero downtime: deploy lewat CI/CD, image immutable, health-gated, dan smoke test sebelum cutover penuh.
- Security: tidak menyimpan token di browser storage, tidak menerima redirect wildcard, dan tidak mengekspose secret di UI/log.
- Client UX: user tidak diminta credentials ulang selama sesi pusat dan refresh token masih valid; client wajib mencoba refresh server-side sebelum mengarahkan user ke login manual.

## Feature Logic Admin Panel

Admin Panel menampilkan Client Stitching Wizard di Dashboard. Wizard ini bukan teks statis: admin mengisi nama aplikasi, client ID, base URL, owner, callback path, logout path, tipe client, environment, dan mode provisioning. Sistem memvalidasi metadata sebelum menghasilkan contract integrasi.

Contract yang dihasilkan berisi redirect URI eksak, back-channel logout URI, scope OIDC, environment handoff, provisioning steps, lifecycle rollout, rollback, dan audit finding. Untuk confidential client, UI hanya menampilkan placeholder `SSO_CLIENT_SECRET=<store-in-vault>` agar secret tetap dibuat dan disimpan melalui vault/CI secret, bukan di browser.

Admin juga dapat menjalankan validasi via broker. Endpoint admin `/admin/api/client-integrations/contract` melakukan validasi server-side terhadap duplicate client ID, redirect URI yang sudah dipakai, wildcard callback/logout path, HTTPS untuk aplikasi live, owner email, dan tipe provisioning. Respons 422 mengembalikan daftar violation tanpa menulis registry production, sehingga proses review tetap aman dan auditable.

Contract broker menampilkan `Registry patch` sebagai artefak perubahan yang harus masuk lewat PR/CI/CD. Confidential client memakai hash secret dari environment, misalnya `CUSTOMER_PORTAL_CLIENT_SECRET_HASH`, bukan secret mentah. Ini menjaga prinsip RFC 7642: provisioning/lifecycle disepakati lintas domain, sementara credential client tetap berada di kontrol broker dan secret manager.

Dashboard juga menampilkan `Provisioning readiness` sebagai artifact operasional. Artifact ini membedakan mode JIT dan SCIM, mencatat identity source, schema/mapping minimum, deprovisioning behavior, audit evidence, dan risk gates. Untuk SCIM, admin wajib memastikan `User`, `Group`, dan discovery service tersedia; deactivate harus memutus akses lokal sebelum login berikutnya dan back-channel logout tetap memutus sesi aktif berdasarkan `sid`. Untuk JIT, admin tetap wajib memverifikasi klaim OIDC, session revoke, dan revalidasi akun saat login berikutnya.

## Dynamic Registration Lifecycle

Tahap berikutnya menambahkan registry dinamis yang tetap mengikuti prinsip zero downtime. Admin tidak langsung menimpa konfigurasi statis; admin melakukan `Stage registration` terlebih dahulu. Status `staged` menyimpan contract, owner, redirect URI, provisioning mode, dan audit trail tanpa membuat client dibaca oleh runtime authorization.

Promosi dilakukan lewat `Activate`. Public client langsung bisa aktif setelah validasi broker, sedangkan confidential client wajib membawa verifier secret hash Argon2id dari Vault atau secret manager. UI dan audit log tidak pernah menampilkan secret hash mentah. Saat status berubah menjadi `active`, broker membaca registration dari database dan menggabungkannya dengan client statis, dengan prioritas tetap pada konfigurasi statis agar rollback rilis lama tidak rusak.

Rollback dilakukan lewat `Rollback / disable`. Status `disabled` membuat broker berhenti menerima client tersebut tanpa menghapus record, sehingga jejak audit, owner, dan alasan lifecycle tetap tersedia. Deploy tetap aman karena pembacaan registry dinamis dilindungi guard `Schema::hasTable('oidc_client_registrations')`; jika kode baru naik sebelum migrasi selesai, broker tetap melayani client statis lama.

Dengan lifecycle ini, Admin Panel tidak hanya menampilkan prosedur RFC 7642, tetapi juga menyediakan feature logic untuk menjahit aplikasi existing atau development ke SSO: validate contract, stage artifact, activate runtime, dan disable sebagai rollback mechanism.

## Audit App Client 2026-04-28

- App A sudah memenuhi pola public client + PKCE: silent SSO, refresh endpoint server-side, BroadcastChannel untuk multi-tab state, HttpOnly Secure session cookie, token rotation, dan back-channel logout.
- App B sebelumnya hanya menyimpan refresh token di session payload tetapi belum melakukan refresh sebelum render dashboard. Ini membuat user bisa diminta login ulang lebih cepat daripada seharusnya dan membuat confidential client belum setara dengan pola multi-client SSO.
- Fix App B: dashboard sekarang melewati `EnsureFreshSession`; access token yang mendekati kedaluwarsa dirotasi melalui broker `/token` memakai refresh token server-side. Jika refresh ditolak, session lokal diputus dan user diarahkan ke `session-expired`.
- Fix App B: payload session mencatat `expires_at`, `created_at`, `last_touched_at`, dan `last_refreshed_at` untuk idle timeout, absolute timeout, dan audit refresh. Token tetap berada di Laravel session store; browser hanya membawa cookie session HttpOnly Secure.
