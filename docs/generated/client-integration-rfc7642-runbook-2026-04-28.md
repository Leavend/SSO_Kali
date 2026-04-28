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

Prinsip zero downtime tetap dijaga dengan pendekatan artifact review: wizard menghasilkan contract yang bisa direview, diuji, dan dipromosikan lewat CI/CD. Production registry tidak diubah langsung dari browser sehingga rollback tetap berbasis tag, route flag, dan client toggle yang dapat diaudit.
