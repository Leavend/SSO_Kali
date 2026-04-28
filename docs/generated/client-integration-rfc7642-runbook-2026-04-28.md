# Client Integration Runbook RFC 7642

Tanggal validasi: 2026-04-28

## Prinsip

RFC 7642 adalah dokumen use case SCIM untuk identity management lintas domain. Untuk integrasi aplikasi client baru, dokumen ini paling relevan sebagai checklist provisioning, attribute sharing, trust agreement, audit, dan account lifecycle. Registrasi OAuth/OIDC client tetap dikelola oleh broker SSO, sementara SCIM atau just-in-time provisioning dipakai untuk sinkronisasi identitas.

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
