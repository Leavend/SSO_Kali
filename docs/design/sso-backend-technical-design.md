# Technical Design Document — SSO Backend (IdP)

**Service:** `services/sso-backend` · **Domain:** `api-sso.timeh.my.id`
**Tanggal:** 2026-06-15 · **Status:** Living document
**Stack:** Laravel + Laravel Passport (native OIDC IdP), PHP 8.x, Pest, Redis, MySQL/SQLite

> **Catatan akurasi:** `docs/ARCHITECTURE.md` masih menyebut **ZITADEL** sebagai identity engine — itu **historis/usang**. Implementasi saat ini adalah **IdP OIDC native di atas Laravel Passport** (tanpa upstream ZITADEL). Dokumen ini adalah sumber kebenaran desain backend yang berlaku sekarang.

---

## 1. Overview

`sso-backend` adalah **OpenID Provider (OP/IdP)** yang menerbitkan dan memverifikasi token untuk seluruh ekosistem Dev-SSO. Ia bertanggung jawab atas autentikasi pengguna, manajemen sesi SSO, penerbitan token (ES256), RBAC, panel admin API, dan single-logout lintas relying party.

**Relying parties (RP):** `sso-frontend` (portal BFF), `sso-admin-frontend` (admin BFF), dan aplikasi pihak ketiga (mis. `apps-sso/selamat-kerja`).

### 1.1 Goals
- OIDC Authorization Code + **PKCE S256 wajib untuk SEMUA client** (termasuk confidential) — divergensi sengaja dari spec demi keamanan seragam.
- Token ditandatangani **ES256 (EC P-256)**; `id_token.aud = client_id`, `access_token.aud = sso-resource-api`.
- **Single role per akun** (invariant; lihat §4.2) + RBAC permission matrix untuk gate admin.
- **Back-channel logout** OIDC: logout di satu RP → fan-out mengakhiri sesi RP lain.
- Hardening admin: MFA assurance (`amr=mfa`), fresh-auth tiers, whitelist immutability.

### 1.2 Non-Goals
- Bukan resource server bisnis (API domain aplikasi ada di masing-masing RP).
- Tidak menyimpan password RP; RP hanya menyimpan sesi lokal.
- Federasi upstream (ZITADEL/external IdP) bersifat opsional via External IdP module, bukan jalur utama.

---

## 2. Arsitektur

### 2.1 Lapisan (layered)
```
HTTP (routes/*.php)
  → Middleware (AdminGuard, EnsureAdminMfaAssurance, RequireAdminSessionManagementRole,
                EnsureFreshAdminAuth, ValidateTokenOrigin, throttle:*)
    → Controllers (Http/Controllers/{Oidc,Admin,Auth})   ← tipis, orkestrasi
      → Actions (app/Actions/**)                          ← satu use-case, transaksional
        → Services (app/Services/**)                      ← logika domain (Oidc, Admin, Security)
          → Repositories (app/Repositories/**)            ← akses data
            → Models (app/Models/**) + Redis + DB
```
Prinsip: **Controller tipis, Action = use-case, Service = aturan domain, Repository = data.** Support helpers (`app/Support/**`) untuk invariant lintas use-case (mis. `SingleRoleAssignment`, `ProtectedAccountPolicy`).

### 2.2 Modul utama (`app/`)
| Modul | Tanggung jawab |
|---|---|
| `Services/Oidc/*` | Discovery, JWKS, klaim (`UserClaimsFactory`), back-channel dispatch, snapshot |
| `Actions/Auth/*`, `Actions/Oidc/*` | Login, logout (single-logout), token exchange, authorize |
| `Services/Admin/*` | `AdminPermissionMatrix`, `AdminMutationResponder` (audit + respons), taxonomy |
| `Actions/Admin/*` | CRUD user/role, `SyncUserRolesAction`, `CreateManagedUserAction` |
| `Support/Admin/*` | `SingleRoleAssignment` (titik tunggal pivot↔kolom), `ProtectedAccountPolicy` |
| `Repositories/*` | `UserRepository`, `SsoSessionRepository`, dsb. |
| `Http/Middleware/*` | Gate admin, origin validation, throttle |

---

## 3. Kontrak OIDC (endpoint nyata)

Endpoint dibaca dari **discovery**, bukan path hardcode. Terverifikasi dari `routes/web.php`, `routes/oidc.php` & `routes/auth.php`:

| Fungsi | Endpoint | Catatan |
|---|---|---|
| Discovery | `GET /.well-known/openid-configuration` | sumber kebenaran endpoint |
| JWKS | `GET /.well-known/jwks.json` & `GET /jwks` | ES256 public keys |
| Authorize | `GET /authorize` | Code + PKCE S256 |
| Token | `POST /token` | `ValidateTokenOrigin` + `throttle:oidc-token` |
| Userinfo | `GET /userinfo` | klaim dari `UserClaimsFactory` |
| Revocation | `POST /revocation`, `POST /oauth/revoke` | |
| Introspection | `POST /introspect`, `POST /oauth2/introspect` | |
| Register session | `POST /connect/register-session` | RP daftar utk fan-out logout |
| Back-channel logout | `POST /connect/backchannel/admin-panel/logout` | per-RP receiver |
| Front-channel fallback | `GET /connect/logout/frontchannel` | |
| End session | `POST /connect/logout` | RP-initiated |
| Health/Ready | `GET /health`, `GET /ready` | probe; `/_internal/*-metrics` (internal) |

**Klaim id_token:** `sub`, `email`, `email_verified`, `name`, `given_name`, `family_name`, `roles[]` (scope `roles`), `permissions[]`, `sid`, `nonce`. `roles[]` dibangun dari pivot `roles` dengan fallback ke kolom `users.role` bila pivot kosong (`UserClaimsFactory`).

---

## 4. Model Data & Invariant

### 4.1 Identitas
- `users` — `subject_id` (opaque, stabil; bukan UUID parsing), `email`, `email_verified_at`, `role` (kolom), profil.
- RBAC: `roles`, `permissions`, pivot `role_user` (**unique `user_id`** sejak migrasi single-role), `permission_role`.

### 4.2 Invariant: SATU peran per akun
- **Gate admin membaca kolom `users.role`** (`AdminPermissionMatrix::canManageSessions`). Pivot `role_user` membawa relasi RBAC. Keduanya **wajib konsisten**.
- **Titik tunggal penegak:** `Support/Admin/SingleRoleAssignment::assign()` — `sync([roleId])` + `forceFill(['role'=>slug])` dalam **satu `DB::transaction`**. Semua penulis peran (`SyncUserRolesAction`, `CreateManagedUserAction`, `AssignAdminRole`, `RegisterController`, `DatabaseSeeder`) **wajib** lewat sini; dilarang `roles()->sync()` langsung.
- DB menegakkan via `unique('user_id')` pada `role_user` (migrasi `2026_06_14_190000`).
- `ProtectedAccountPolicy` — akun di `config('sso.admin_emails')` immutable; cegah self-demote admin terakhir; slug privileged dibaca dari `config('sso.admin.session_management_roles')` (array).

### 4.3 Sesi SSO
- Sesi SSO diindeks di Redis by **`sub`** dan **`sid`** (O(1) `sMembers`, bukan `KEYS`). TTL via `EXPIRE` (tanpa `GT` pada set baru). RP terdaftar lewat `register-session` agar dispatcher punya target back-channel.

---

## 5. Keamanan

- **PKCE S256 wajib** semua client. `ValidateTokenOrigin` di `/token`.
- **Signing ES256**; rotasi JWKS terdokumentasi (`docs/testing/jwks-rotation-*`).
- **Gate admin berlapis:** `AdminGuard` (set `admin_user`) → `RequireAdminSessionManagementRole` → `EnsureAdminMfaAssurance` (`amr` memuat `mfa`) → `EnsureFreshAdminAuth` (tier read/write/step_up).
- **Audit:** `AdminMutationResponder` mengaudit `succeeded`/`failed` setiap mutasi; `RoleManagementException` disurfacing sebagai 422 bermakna, exception lain → 422 generik.
- **Back-channel logout:** validasi `logout_token` (sig + `iss` + `aud` + `events` + nonce-absent + `sid`/`sub`).
- Throttle granular: `oidc-token`, `oidc-callback`, `password-reset`, `password-reset-confirm`, `oidc-resource`.
- Referensi: `docs/security/{cookie-policy-standard,oidc-negative-test-matrix,jwt-verifier-test-vectors,logout-validation-test-vectors}.md`.

---

## 6. Observability & Operasi
- `GET /health`, `GET /ready`; metrik internal `/_internal/performance-metrics`, `/_internal/queue-metrics`.
- Queue (Laravel) untuk email/aktivasi; `php artisan queue:listen`.
- Logging terstruktur (`app/Logging`).

---

## 7. Deployment
- `services/sso-backend/Dockerfile` (+ opsi FrankenPHP/Octane `docker-compose.frankenphp.yml`, `docker/frankenphp/Caddyfile`).
- Edge: nginx → traefik (`infra/traefik`), TLS di `websecure:443` (HTTP/2 otomatis).
- Config kunci: `config/sso.php` (`admin.session_management_roles:158`, `admin_emails:185`, seed admin, MFA `accepted_amr`).

---

## 8. Strategi Test (peta, bukan pengganti TDD test plan)
- **Pest**: `composer test` → `vendor/bin/pest`. ~310 test di `tests/{Unit,Feature,Stress,Support}`.
- Layer: **Unit** (`Identity`, `Security`, `Auth`, `Admin`) · **Feature** (alur HTTP admin/auth/oidc) · **Stress** (load).
- Evidence pack & gate: `docs/testing/*` (backchannel-logout-gate, argon2id-secret-policy-gate, kpi-promotion-gate, oidc-proxy-chain-e2e).
- Negative matrices: `docs/security/oidc-negative-test-matrix.md`.

---

## 9. Risiko & Hutang Teknis
| Risiko | Mitigasi |
|---|---|
| Drift pivot↔kolom peran | Titik tunggal `SingleRoleAssignment` + DB `unique(user_id)` (§4.2) |
| `ARCHITECTURE.md` usang (ZITADEL) | Dokumen ini = SoT; jadwalkan refactor ARCHITECTURE.md |
| Rollback migrasi single-role bersifat **lossy** | Terdokumentasi di migrasi; backup sebelum rollback |
| Penyajian aset RP tanpa kompresi | Lihat `docs/audits/frontend-performance-lcp-production-readiness-audit-2026-06-15.md` |

---

## 10. File Referensi
| File | Topik |
|---|---|
| `routes/{oidc,auth,admin}.php` | kontrak endpoint |
| `app/Services/Oidc/UserClaimsFactory.php` | klaim & fallback peran |
| `app/Support/Admin/{SingleRoleAssignment,ProtectedAccountPolicy}.php` | invariant peran |
| `app/Services/Admin/{AdminPermissionMatrix,AdminMutationResponder}.php` | gate & audit |
| `config/sso.php` | konfigurasi admin/MFA/seed |
| `docs/contracts/*`, `docs/security/*`, `docs/testing/*` | kontrak & evidence |

---

_TDD dibuat 2026-06-15. Menggantikan asumsi ZITADEL yang usang di `ARCHITECTURE.md` dengan realitas IdP OIDC native Laravel Passport. Inti: OP yang menerbitkan token ES256 dengan PKCE S256 wajib semua client; invariant satu-peran ditegakkan lewat satu titik (`SingleRoleAssignment`) + DB unique; gate admin berlapis (role+MFA+fresh-auth); single-logout via back-channel fan-out. Sumber kebenaran endpoint = discovery. Lihat juga TDD sso-docs & standar mutu di `docs/design/`._
