# SSO Use Case Traceability Matrix

Legend:

- `Done`: implemented and test/production evidence exists.
- `Partial`: implementation exists but missing full evidence, UX, or E2E coverage.
- `Gap`: not confirmed or requires implementation.
- `Hold`: intentionally deferred.

## A. Discovery & Client Configuration

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-01 | Lihat OIDC Discovery | High | Done | Discovery endpoint tested, production smoke, edge cache WRK passed |
| UC-02 | Lihat JWKS | High | Done | JWKS endpoints tested, production smoke, edge cache WRK passed |
| UC-03 | Kelola Client Aplikasi | High | Partial | Admin client APIs and FR-001 registry exist; add full admin UI/E2E evidence |
| UC-04 | Kelola Redirect URI Client | High | Partial | Registry/provisioning evidence exists; add mutation validation tests if missing |
| UC-05 | Kelola Scope Client | High | Partial | Registry evidence exists; add admin scope lifecycle tests if missing |
| UC-06 | Kelola Client Secret | High | Partial | Confidential client support exists; add rotation/redaction/admin tests if missing |

## B. Authentication & Authorization

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-07 | Memulai Authorization Request | High | Done | Authorization routes and protocol tests exist |
| UC-08 | Login via Portal SSO | High | Partial | Login action/session files exist; add browser E2E evidence |
| UC-09 | Validasi Session Login SSO | High | Done | Session inspection/action tests exist |
| UC-10 | Menampilkan Consent Aplikasi | Medium | Gap | Verify consent UI/backend; implement if absent |
| UC-11 | Menyetujui atau Menolak Consent | Medium | Gap | Verify consent decision flow; implement tests |
| UC-12 | Menerbitkan Authorization Code | High | Done | OIDC authorization/token flow tests exist |
| UC-13 | Redirect Callback ke Client | High | Done | Redirect URI validation/client registry tests exist |

## C. Token Lifecycle

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-14 | Tukar Authorization Code dengan Token | High | Done | Token route/protocol tests exist |
| UC-15 | Validasi PKCE Verifier | High | Done | PKCE support expected in token tests; ensure explicit negative test remains green |
| UC-16 | Validasi Client Secret | High | Done | Confidential client support; ensure explicit invalid secret tests |
| UC-17 | Terbitkan Access Token | High | Done | OIDC token service/tests |
| UC-18 | Terbitkan Refresh Token | High | Done | Refresh lifecycle tests expected |
| UC-19 | Refresh Token | High | Done | Token refresh route exists; verify integration test coverage |
| UC-20 | Rotasi Refresh Token | High | Done | Refresh rotation referenced in integration readiness; verify explicit tests |
| UC-21 | Revokasi Token | Medium | Done | Revocation routes and contract tests exist |
| UC-22 | Validasi Token JWT | High | Done | Signing/verifier services and tests exist |
| UC-23 | Lihat UserInfo | High | Done | UserInfo route protected and tested |

## D. Profile & User Portal

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-24 | Lihat Profil Pengguna | High | Partial | `/api/profile` exists; add portal UI/E2E evidence |
| UC-25 | Ubah Profil Pengguna | Medium | Gap | Implement or explicitly defer profile mutation |
| UC-26 | Lihat Connected Apps | Medium | Partial | Frontend Apps view exists; add backend/UI E2E evidence |
| UC-27 | Lihat Session Aktif Pengguna | High | Partial | Session center/admin APIs exist; add user portal E2E evidence |
| UC-28 | Cabut Akses Aplikasi Client | Medium | Gap | Implement/reuse revocation with user portal UX |

## E. Session & Logout

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-29 | Registrasi Sesi Client | High | Done | `/connect/register-session` route and contract tests exist |
| UC-30 | Daftar Sesi SSO | High | Partial | Admin/session services exist; add user-facing list evidence |
| UC-31 | Logout SSO | High | Done | `/api/auth/logout` clears cookie |
| UC-32 | Logout dari Semua Aplikasi | High | Partial | Server queues all clients; missing App A/App B local-session E2E |
| UC-33 | Back-channel Logout | High | Done | `DispatchBackChannelLogoutJob` and logout token tests |
| UC-34 | Terima Back-channel Logout di Client | High | Gap | Add App A/App B receiver contract/E2E |
| UC-35 | Hapus Session Lokal Client | High | Gap | Add App A/App B local session deletion E2E |

## F. Admin Management

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-36 | Login Administrator | High | Partial | Admin auth boundary tests exist; add production UI E2E evidence |
| UC-37 | Lihat Dashboard Admin | High | Partial | Admin frontend exists; add E2E evidence |
| UC-38 | Kelola Pengguna | High | Partial | Admin user routes protected; add CRUD tests/evidence |
| UC-39 | Menonaktifkan Pengguna | High | Gap | Verify/implement disable user flow |
| UC-40 | Reset Password Pengguna | Medium | Gap | Verify/implement reset flow |
| UC-41 | Kelola Role | Medium | Gap | Verify/implement role management |
| UC-42 | Kelola Role Based Access Control | High | Partial | Admin guard/freshness tests exist; add RBAC matrix management |
| UC-43 | Kelola Matriks Izin | Medium | Gap | Implement/admin backlog |
| UC-44 | Monitor Sesi Aktif | High | Partial | Admin sessions API exists; add UI/E2E evidence |
| UC-45 | Paksa Logout Session Pengguna | High | Partial | Delete session routes exist; add E2E and audit evidence |
| UC-46 | Lihat Audit Trail Administrator | High | Partial | Audit events exist; add query/filter endpoint tests |
| UC-47 | Manajemen Profil Admin Sendiri | Medium | Gap | Implement/admin backlog |
| UC-48 | Monitor Health & Status Sistem Dasar | Medium | Done | `/up`, `/health`, `/ready`, production smoke and WRK evidence |

## G. Use Case yang Di-Hold

| UC | Name | Priority | Status | Evidence / Next Action |
|---|---|---:|---|---|
| UC-49 | Mengatur Kebijakan MFA | Low | Hold | Explicitly deferred |
| UC-50 | Verifikasi Login dengan MFA | Low | Hold | Explicitly deferred |
| UC-51 | Mengelola Metode MFA Pengguna | Low | Hold | Explicitly deferred |
| UC-52 | Menilai Risiko Login Pengguna | Low | Hold | Explicitly deferred |
| UC-53 | Menjalankan Risk-Based Authentication | Low | Hold | Explicitly deferred |
| UC-54 | Mengelola Perangkat Pengguna | Low | Hold | Explicitly deferred |
| UC-55 | Mendeteksi Perangkat saat Login | Low | Hold | Explicitly deferred |
| UC-56 | Mengirim Notifikasi Keamanan | Low | Hold | Explicitly deferred |
| UC-57 | Mengirim OTP atau Kode Verifikasi | Low | Hold | Explicitly deferred |
| UC-58 | Monitor Infrastruktur dan Deployment | Low | Partial | DevOps docs and smoke scripts exist; add dashboard/runbook evidence |
| UC-59 | Mengelola Backup dan Recovery Sistem | Low | Partial | Backup/restore docs exist; add scheduled backup verification evidence |

## Immediate Next Priorities

1. UC-34/UC-35: App A/App B receiver and local session deletion E2E.
2. UC-46: admin audit query/filter tests for logout delivery events.
3. UC-10/UC-11: consent UI/decision verification.
4. UC-25/UC-28: user portal profile mutation and client access revocation.
