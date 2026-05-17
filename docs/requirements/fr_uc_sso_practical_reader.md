# Daftar Praktis Functional Requirement & Use Case SSO

**Versi:** Reader-Friendly v1.0
**Tanggal:** 2026-05-12
**Basis:** hasil ekspansi FR & UC SSO Best Practice + blueprint desain perluasan requirement.
**Tujuan:** membuat daftar FR dan UC lebih mudah dibaca oleh user/stakeholder tanpa kehilangan traceability ke requirement teknis.

---

## 1. Cara Membaca Dokumen

- **FR-001, FR-002, dst.** = Functional Requirement yang sudah dibuat berurutan agar mudah dirujuk di meeting, backlog, dan QA.
- **UC-01, UC-02, dst.** = Use Case yang sudah dibuat berurutan agar mudah dibaca user dan stakeholder bisnis.
- **Domain** dipakai untuk mengelompokkan requirement/use case berdasarkan kepentingan: Discovery, Authentication, Token, Session, Admin, Security, dan Operations.
- **Prioritas/Fase** memakai format praktis seperti `Tinggi / MVP`, `Sedang / Phase-2`, atau `Rendah / Phase-3`.
- **Status** belum dianggap final sebelum repo audit. `TBD Repo Audit` berarti perlu dicek ke kode, test, dan evidence implementasi.
- **Kode asal** seperti `FR-D-01` atau `UC-A-01` tetap tersedia di appendix agar engineer masih bisa menelusuri dokumen teknis lama.

### Legend Status

| Status | Arti Praktis |
| --- | --- |
| ✓ Implemented | Sudah dinyatakan ada di blueprint, tetap perlu evidence final dari repo. |
| ◐ Partial | Sudah ada sebagian, masih ada gap/validasi lanjutan. |
| ✗ Gap | Belum ada atau belum memenuhi kebutuhan target. |
| ◻ Planned | Direncanakan untuk fase berikutnya/backlog. |
| TBD Repo Audit | Belum boleh diklaim; perlu audit implementasi. |

---

## 2. Aktor

| ID | Nama Aktor | Keterangan Praktis |
| --- | --- | --- |
| A-01 | Pengguna | User yang login, memberi consent, mengelola profil/session. |
| A-02 | Administrator | Admin yang mengelola user, role, client, policy, dan audit. |
| A-03 | App Client Public | Aplikasi public client, contoh App A / Next.js. |
| A-04 | App Client Confidential | Aplikasi confidential client, contoh App B / Laravel. |
| A-05 | Browser / User-Agent | Browser pengguna yang membawa redirect, cookie, dan session. |
| A-06 | Laravel SSO Server | Core IdP/Authorization Server/SSO backend. |
| A-07 | SSO Admin Panel | UI admin untuk user, client, role, policy, audit. |
| A-08 | SSO User Profile Portal | UI user untuk profil, password, connected apps, session. |
| A-09 | Notification Provider | Email/SMS/push provider untuk security notification. |
| A-10 | DevOps / Operator | Operator deployment, monitoring, backup, DR, dan incident. |
| A-11 | Security Officer / DPO | Role audit, compliance, privacy, dan review security. |
| A-12 | Resource Server | Service yang memvalidasi access token atau introspection. |

---

## 3. Ringkasan Jumlah per Domain

### 3.1 Functional Requirement

| Domain | Range ID | Jumlah FR |
| --- | --- | --- |
| A. Discovery & Metadata | FR-001 – FR-005 | 5 |
| B. Client Management | FR-006 – FR-012 | 7 |
| C. Authentication | FR-013 – FR-022 | 10 |
| D. Authorization & Consent | FR-023 – FR-028 | 6 |
| E. Token Lifecycle | FR-029 – FR-038 | 10 |
| F. Session & Logout | FR-039 – FR-044 | 6 |
| G. User Profile & Self-Service | FR-045 – FR-049 | 5 |
| H. Admin & Governance | FR-050 – FR-056 | 7 |
| I. External IdP Integration | FR-057 – FR-059 | 3 |
| J. Error Handling & UX | FR-060 – FR-063 | 4 |

### 3.2 Use Case

| Domain | Range ID | Jumlah UC |
| --- | --- | --- |
| A. Discovery & Client Configuration | UC-01 – UC-09 | 9 |
| B. Authentication & Authorization | UC-10 – UC-21 | 12 |
| C. Token Lifecycle | UC-22 – UC-33 | 12 |
| D. Profile & User Self-Service | UC-34 – UC-42 | 9 |
| E. Session & Logout | UC-43 – UC-50 | 8 |
| F. Admin Management | UC-51 – UC-65 | 15 |
| G. Security & Risk | UC-66 – UC-76 | 11 |
| H. Integration & Operations | UC-77 – UC-83 | 7 |

---

## 4. Daftar Functional Requirement

Kolom **UC Terkait** memakai ID use case baru agar requirement mudah ditelusuri ke skenario user.

### A. Discovery & Metadata

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-001 | Publikasi OIDC Discovery | Tinggi / MVP | TBD Repo Audit | UC-01, UC-08 |
| FR-002 | Publikasi JWKS Signing Key | Tinggi / MVP | TBD Repo Audit | UC-02, UC-23, UC-31, UC-64, UC-80 |
| FR-003 | Ketersediaan Discovery & JWKS | Tinggi / MVP | TBD Repo Audit | UC-01, UC-77 |
| FR-004 | Registry Scope, Claim & Algorithm | Tinggi / MVP | TBD Repo Audit | UC-07, UC-13 |
| FR-005 | Konsistensi Issuer & Endpoint | Tinggi / MVP | TBD Repo Audit | UC-01, UC-08, UC-10, UC-23 |

### B. Client Management

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-006 | Kelola Client Aplikasi oleh Admin | Tinggi / MVP | TBD Repo Audit | UC-03, UC-60 |
| FR-007 | Validasi Tipe Client & Auth Token Endpoint | Tinggi / MVP | TBD Repo Audit | UC-22, UC-30 |
| FR-008 | Validasi Redirect URI Exact Match | Tinggi / MVP | TBD Repo Audit | UC-04, UC-16 |
| FR-009 | Siklus Hidup Client Secret | Tinggi / MVP | TBD Repo Audit | UC-05, UC-61 |
| FR-010 | Validasi Logout URI Client | Tinggi / MVP | TBD Repo Audit | UC-04, UC-46, UC-47 |
| FR-011 | Kebijakan Scope & Consent per Client | Tinggi / MVP | TBD Repo Audit | UC-07, UC-13, UC-39 |
| FR-012 | Suspend & Decommission Client | Tinggi / MVP | TBD Repo Audit | UC-06, UC-09 |

### C. Authentication

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-013 | Login OIDC via Authorization Code + PKCE | Tinggi / MVP | ✓ Implemented | UC-10, UC-17, UC-22 |
| FR-014 | Login Password Lokal | Tinggi / MVP | TBD Repo Audit | UC-11, UC-18 |
| FR-015 | Password Policy & Penyimpanan Argon2id | Tinggi / MVP | TBD Repo Audit | UC-20, UC-36, UC-37, UC-53 |
| FR-016 | Proteksi Brute Force & Rate Limit | Tinggi / MVP | TBD Repo Audit | UC-11, UC-18, UC-74, UC-75 |
| FR-017 | Keamanan Cookie Session | Tinggi / MVP | TBD Repo Audit | UC-11, UC-43 |
| FR-018 | Pendaftaran MFA | Sedang / Phase-2; Tinggi untuk Admin | ◻ Planned | UC-51, UC-66, UC-67, UC-73 |
| FR-019 | Verifikasi MFA saat Login | Sedang / Phase-2; Tinggi untuk Admin | ◻ Planned | UC-19, UC-51, UC-66, UC-67, UC-72, UC-73 |
| FR-020 | Recovery Code & Pemulihan MFA | Sedang / Phase-2 | ◻ Planned | UC-66, UC-67, UC-69, UC-71, UC-76 |
| FR-021 | Step-up Authentication | Sedang / Phase-2 | TBD Repo Audit | UC-14, UC-19, UC-67, UC-68, UC-72 |
| FR-022 | Lock/Disable Akun & Lifecycle Credential | Tinggi / MVP | TBD Repo Audit | UC-18, UC-20, UC-37, UC-50, UC-55, UC-76 |

### D. Authorization & Consent

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-023 | Validasi Authorization Request | Tinggi / MVP | TBD Repo Audit | UC-10, UC-16, UC-17 |
| FR-024 | Penerbitan Authorization Code | Tinggi / MVP | TBD Repo Audit | UC-12, UC-22 |
| FR-025 | Enforcement Scope & Claim | Tinggi / MVP | TBD Repo Audit | UC-07, UC-13, UC-23, UC-24 |
| FR-026 | Pencatatan & Pencabutan Consent | Tinggi / MVP | TBD Repo Audit | UC-12, UC-13, UC-21, UC-39 |
| FR-027 | Penanganan Prompt Login/Consent | Tinggi / MVP | TBD Repo Audit | UC-14, UC-15 |
| FR-028 | Error Response Authorization yang Standar | Tinggi / MVP | TBD Repo Audit | UC-15, UC-16, UC-17, UC-21 |

### E. Token Lifecycle

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-029 | Exchange Code ke Token | Tinggi / MVP | TBD Repo Audit | UC-22, UC-30 |
| FR-030 | ID Token Claims & Signing | Tinggi / MVP | TBD Repo Audit | UC-19, UC-23 |
| FR-031 | Profil JWT Access Token | Tinggi / MVP | TBD Repo Audit | UC-24, UC-32 |
| FR-032 | Rotasi Refresh Token | Tinggi / MVP | TBD Repo Audit | UC-25, UC-33 |
| FR-033 | Deteksi Penyalahgunaan Refresh Token | Tinggi / MVP | TBD Repo Audit | UC-26, UC-71 |
| FR-034 | Endpoint Pencabutan Token | Tinggi / MVP | TBD Repo Audit | UC-06, UC-09, UC-27, UC-39, UC-76 |
| FR-035 | Endpoint UserInfo | Tinggi / MVP | TBD Repo Audit | UC-24, UC-29 |
| FR-036 | Endpoint Token Introspection | Sedang / Phase-2 | ✓ Implemented — verified by `tests/Feature/Oidc/IntrospectionContractTest.php` | UC-28, UC-29 |
| FR-037 | Binding Token ke Session & Client | Tinggi / MVP | TBD Repo Audit | UC-32, UC-45, UC-46 |
| FR-038 | Kebijakan Masa Berlaku Token | Tinggi / MVP | TBD Repo Audit | UC-25, UC-33, UC-49, UC-62 |

### F. Session & Logout

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-039 | Session SSO & SID | Tinggi / MVP | TBD Repo Audit | UC-11, UC-43, UC-49 |
| FR-040 | Registry Session Aplikasi Client | Tinggi / MVP | TBD Repo Audit | UC-44, UC-46 |
| FR-041 | Logout dari Aplikasi Client | Tinggi / MVP | TBD Repo Audit | UC-45 |
| FR-042 | Back-channel Logout | Tinggi / MVP | ✓ Implemented — verified by `tests/Feature/Oidc/BackChannelLogoutPartialFailureContractTest.php`, `tests/Unit/Oidc/LocalLogoutTokenVerifierReplayTest.php` | UC-46, UC-48 |
| FR-043 | Front-channel Logout Fallback | Sedang / MVP | TBD Repo Audit | UC-46, UC-47 |
| FR-044 | Audit & Idempotency Global Logout | Tinggi / MVP | TBD Repo Audit | UC-26, UC-40, UC-45, UC-48, UC-50, UC-76 |

### G. User Profile & Self-Service

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-045 | Lihat Profil User | Tinggi / MVP | TBD Repo Audit | UC-34 |
| FR-046 | Ubah & Verifikasi Profil | Sedang / MVP | TBD Repo Audit | UC-35, UC-54 |
| FR-047 | Ganti & Reset Password | Tinggi / MVP | TBD Repo Audit | UC-20, UC-36, UC-37, UC-71 |
| FR-048 | Connected Apps & Active Sessions | Sedang / Phase-2 | TBD Repo Audit | UC-38, UC-39, UC-40, UC-70 |
| FR-049 | Workflow Hak Data Pribadi | Tinggi / MVP intake; Phase-2 automation | TBD Repo Audit | UC-41, UC-42, UC-65 |

### H. Admin & Governance

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-050 | Dashboard Admin | Tinggi / MVP | TBD Repo Audit | UC-52 |
| FR-051 | Manajemen Lifecycle User | Tinggi / MVP | TBD Repo Audit | UC-50, UC-53, UC-54, UC-55 |
| FR-052 | Audit Log, Export & Retention | Tinggi / MVP | TBD Repo Audit | UC-26, UC-41, UC-42, UC-57, UC-58, UC-59, UC-63, UC-65, UC-79 |
| FR-053 | RBAC Admin & Authorization | Tinggi / MVP | TBD Repo Audit | UC-51, UC-52, UC-56, UC-57, UC-73 |
| FR-054 | Console Kelola Client | Tinggi / MVP | TBD Repo Audit | UC-03, UC-04, UC-05, UC-60, UC-61 |
| FR-055 | Kelola Security Policy | Sedang / Phase-2 | TBD Repo Audit | UC-62, UC-68, UC-70 |
| FR-056 | Monitoring Health & Incident Action | Sedang / MVP | TBD Repo Audit | UC-65, UC-75, UC-77, UC-78, UC-80, UC-82, UC-83 |

### I. External IdP Integration

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-057 | Konfigurasi Discovery IdP Eksternal | Rendah / Phase-3 | ✓ Implemented — verified by `tests/Feature/ExternalIdp/ExternalIdpPublicCallbackRouteContractTest.php` | UC-81 |
| FR-058 | Mapping Login Federasi | Rendah / Phase-3 | ✓ Implemented — verified by `tests/Feature/ExternalIdp/ExternalIdpClaimsMappingContractTest.php` | UC-81 |
| FR-059 | Failover & Disable Federasi | Rendah / Phase-3 | ✓ Implemented — verified by `tests/Feature/ExternalIdp/ExternalIdpCircuitBreakerContractTest.php` | UC-81, UC-82 |

### J. Error Handling & UX

| ID | Nama Functional Requirement | Prioritas/Fase | Status | UC Terkait |
| --- | --- | --- | --- | --- |
| FR-060 | Taksonomi Error OAuth/OIDC | Tinggi / MVP | TBD Repo Audit | UC-16, UC-17, UC-29, UC-30 |
| FR-061 | UX Error untuk User & Lokalisasi | Sedang / MVP | TBD Repo Audit | UC-18, UC-21, UC-74 |
| FR-062 | Pesan Error Aman | Tinggi / MVP | TBD Repo Audit | UC-30, UC-63 |
| FR-063 | Diagnostik Developer & Correlation ID | Sedang / MVP | TBD Repo Audit | UC-63, UC-82 |

---

## 5. Daftar Use Case

Format dibuat ringkas sesuai kebutuhan pembaca user: **ID, Nama Use Case, Aktor Utama, dan Prioritas/Fase**.

### A. Discovery & Client Configuration

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-01 | Lihat OIDC Discovery | A-03 / A-04 | Tinggi / MVP |
| UC-02 | Lihat JWKS | A-03 / A-04 | Tinggi / MVP |
| UC-03 | Kelola Client Aplikasi Baru | A-02 | Tinggi / MVP |
| UC-04 | Kelola Redirect/Logout URI Client | A-02 | Tinggi / MVP |
| UC-05 | Kelola Client Secret | A-02 | Tinggi / MVP |
| UC-06 | Suspend Client | A-02 | Tinggi / MVP |
| UC-07 | Kelola Scope & Consent Client | A-02 | Tinggi / MVP |
| UC-08 | Validasi Issuer & Metadata Client | A-03 / A-04 | Tinggi / MVP |
| UC-09 | Decommission Client | A-02 | Sedang / MVP |

### B. Authentication & Authorization

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-10 | Memulai Authorization Request | A-01 via RP | Tinggi / MVP |
| UC-11 | Login via Portal SSO | A-01 | Tinggi / MVP |
| UC-12 | Melanjutkan Authorization Setelah Login | A-01 | Tinggi / MVP |
| UC-13 | Menampilkan dan Menyetujui Consent | A-01 | Tinggi / MVP |
| UC-14 | Paksa Login Ulang | A-01 | Tinggi / MVP |
| UC-15 | Silent Authentication | A-03 / A-04 | Sedang / MVP |
| UC-16 | Tolak Redirect URI Tidak Valid | A-03 / A-04 | Tinggi / MVP |
| UC-17 | Tolak PKCE/State/Nonce Tidak Valid | A-03 / A-04 | Tinggi / MVP |
| UC-18 | Menangani Akun Terkunci saat Login | A-01 | Tinggi / MVP |
| UC-19 | Step-up Authentication | A-01 | Sedang / Phase-2 |
| UC-20 | Force Change Password Expired | A-01 | Sedang / MVP |
| UC-21 | User Menolak Consent | A-01 | Tinggi / MVP |

### C. Token Lifecycle

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-22 | Tukar Authorization Code menjadi Token | A-03 / A-04 | Tinggi / MVP |
| UC-23 | Validasi ID Token | A-03 / A-04 | Tinggi / MVP |
| UC-24 | Akses UserInfo | A-03 / A-04 | Tinggi / MVP |
| UC-25 | Refresh Token dengan Rotation | A-03 / A-04 | Tinggi / MVP |
| UC-26 | Deteksi Reuse Refresh Token | A-06 | Tinggi / MVP |
| UC-27 | Cabut Token | A-03 / A-04 / A-01 | Tinggi / MVP |
| UC-28 | Validasi Token via Introspection | A-12 | Sedang / Phase-2 |
| UC-29 | Tangani Token Expired/Unknown | A-03 / A-04 / A-12 | Tinggi / MVP |
| UC-30 | Tangani Client Auth Gagal | A-04 | Tinggi / MVP |
| UC-31 | Validasi Token saat Key Rotation | A-03 / A-04 / A-12 | Tinggi / MVP |
| UC-32 | Tolak Token Wrong Audience | A-12 | Tinggi / MVP |
| UC-33 | Terapkan Masa Berlaku Token | A-06 | Tinggi / MVP |

### D. Profile & User Self-Service

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-34 | Lihat Profil | A-01 | Tinggi / MVP |
| UC-35 | Ubah Profil | A-01 | Sedang / MVP |
| UC-36 | Ganti Password | A-01 | Tinggi / MVP |
| UC-37 | Reset Password | A-01 | Tinggi / MVP |
| UC-38 | Lihat Connected Apps | A-01 | Sedang / Phase-2 |
| UC-39 | Cabut Consent Aplikasi | A-01 | Sedang / Phase-2 |
| UC-40 | Lihat dan Tutup Active Sessions | A-01 | Sedang / Phase-2 |
| UC-41 | Request Export Data Pribadi | A-01 | Tinggi / MVP intake |
| UC-42 | Request Hapus/Anonim Akun | A-01 | Tinggi / MVP intake |

### E. Session & Logout

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-43 | Buat Session SSO & SID | A-06 | Tinggi / MVP |
| UC-44 | Register Session Aplikasi Client | A-06 | Tinggi / MVP |
| UC-45 | Logout dari Aplikasi Client | A-03 / A-04 | Tinggi / MVP |
| UC-46 | Kirim Back-channel Logout ke Semua Client | A-06 | Tinggi / MVP |
| UC-47 | Jalankan Front-channel Logout Fallback | A-06 | Sedang / MVP |
| UC-48 | Tangani Logout Idempotent/Race | A-06 | Tinggi / MVP |
| UC-49 | Terapkan Session Expiry & Idle Timeout | A-01 | Tinggi / MVP |
| UC-50 | Admin Tutup Session User | A-02 | Tinggi / MVP |

### F. Admin Management

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-51 | Admin Login | A-02 | Tinggi / MVP |
| UC-52 | Admin Lihat Dashboard | A-02 | Tinggi / MVP |
| UC-53 | Admin Buat User | A-02 | Tinggi / MVP |
| UC-54 | Admin Ubah Data User | A-02 | Tinggi / MVP |
| UC-55 | Admin Lock/Unlock User | A-02 | Tinggi / MVP |
| UC-56 | Admin Assign Role | A-02 | Tinggi / MVP |
| UC-57 | Review Matriks RBAC | A-11 | Sedang / MVP |
| UC-58 | Admin Lihat Audit Log | A-02 / A-11 | Tinggi / MVP |
| UC-59 | Admin Export Audit Log | A-11 | Tinggi / MVP |
| UC-60 | Admin Konfigurasi Client | A-02 | Tinggi / MVP |
| UC-61 | Admin Rotasi Client Secret | A-02 | Tinggi / MVP |
| UC-62 | Admin Kelola Security Policy | A-11 | Sedang / Phase-2 |
| UC-63 | Investigasi Incident dengan Correlation ID/SID | A-11 | Tinggi / MVP |
| UC-64 | Operator Kelola Key Rotation | A-10 | Tinggi / MVP |
| UC-65 | Generate Compliance Evidence Pack | A-11 | Sedang / MVP |

### G. Security & Risk

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-66 | Daftar MFA | A-01 / A-02 | Sedang / Phase-2; Tinggi Admin |
| UC-67 | Verifikasi Login dengan MFA | A-01 | Sedang / Phase-2 |
| UC-68 | Evaluasi Risk Score | A-06 | Rendah / Phase-3 |
| UC-69 | Recovery MFA/Lost Factor | A-01 | Sedang / Phase-2 |
| UC-70 | Kelola Device | A-01 | Sedang / Phase-2 |
| UC-71 | Kirim Security Notification | A-06 | Sedang / Phase-2 |
| UC-72 | Challenge Login Mencurigakan | A-01 | Rendah / Phase-3 |
| UC-73 | Wajib MFA untuk Admin | A-02 | Tinggi / MVP/Phase-2 gate |
| UC-74 | Respon Rate Limit/Throttle | A-06 | Tinggi / MVP |
| UC-75 | Kelola IP Blocklist/Allowlist | A-10 / A-11 | Sedang / Phase-2 |
| UC-76 | Emergency Credential Reset | A-11 | Tinggi / MVP |

### H. Integration & Operations

| ID | Nama Use Case | Aktor Utama | Prioritas/Fase |
| --- | --- | --- | --- |
| UC-77 | Monitor SLI Endpoint OIDC | A-10 | Tinggi / MVP |
| UC-78 | Backup & Restore Identity Store | A-10 | Tinggi / MVP |
| UC-79 | Export Log ke SIEM | A-10 / A-11 | Tinggi / MVP |
| UC-80 | Drill Rotasi JWKS Key | A-10 | Tinggi / MVP |
| UC-81 | Pilot Federation External IdP | A-10 / A-11 | Rendah / Phase-3 |
| UC-82 | Jalankan Incident Runbook SEV | A-10 / A-11 | Tinggi / MVP |
| UC-83 | DR Failover | A-10 | Sedang / Phase-2 |

---

## 6. Traceability Praktis FR → UC

Bagian ini membantu QA, BA, dan engineer melihat use case mana yang merealisasikan tiap requirement.

### A. Discovery & Metadata

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-001 | Publikasi OIDC Discovery | UC-01, UC-08 |
| FR-002 | Publikasi JWKS Signing Key | UC-02, UC-23, UC-31, UC-64, UC-80 |
| FR-003 | Ketersediaan Discovery & JWKS | UC-01, UC-77 |
| FR-004 | Registry Scope, Claim & Algorithm | UC-07, UC-13 |
| FR-005 | Konsistensi Issuer & Endpoint | UC-01, UC-08, UC-10, UC-23 |

### B. Client Management

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-006 | Kelola Client Aplikasi oleh Admin | UC-03, UC-60 |
| FR-007 | Validasi Tipe Client & Auth Token Endpoint | UC-22, UC-30 |
| FR-008 | Validasi Redirect URI Exact Match | UC-04, UC-16 |
| FR-009 | Siklus Hidup Client Secret | UC-05, UC-61 |
| FR-010 | Validasi Logout URI Client | UC-04, UC-46, UC-47 |
| FR-011 | Kebijakan Scope & Consent per Client | UC-07, UC-13, UC-39 |
| FR-012 | Suspend & Decommission Client | UC-06, UC-09 |

### C. Authentication

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-013 | Login OIDC via Authorization Code + PKCE | UC-10, UC-17, UC-22 |
| FR-014 | Login Password Lokal | UC-11, UC-18 |
| FR-015 | Password Policy & Penyimpanan Argon2id | UC-20, UC-36, UC-37, UC-53 |
| FR-016 | Proteksi Brute Force & Rate Limit | UC-11, UC-18, UC-74, UC-75 |
| FR-017 | Keamanan Cookie Session | UC-11, UC-43 |
| FR-018 | Pendaftaran MFA | UC-51, UC-66, UC-67, UC-73 |
| FR-019 | Verifikasi MFA saat Login | UC-19, UC-51, UC-66, UC-67, UC-72, UC-73 |
| FR-020 | Recovery Code & Pemulihan MFA | UC-66, UC-67, UC-69, UC-71, UC-76 |
| FR-021 | Step-up Authentication | UC-14, UC-19, UC-67, UC-68, UC-72 |
| FR-022 | Lock/Disable Akun & Lifecycle Credential | UC-18, UC-20, UC-37, UC-50, UC-55, UC-76 |

### D. Authorization & Consent

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-023 | Validasi Authorization Request | UC-10, UC-16, UC-17 |
| FR-024 | Penerbitan Authorization Code | UC-12, UC-22 |
| FR-025 | Enforcement Scope & Claim | UC-07, UC-13, UC-23, UC-24 |
| FR-026 | Pencatatan & Pencabutan Consent | UC-12, UC-13, UC-21, UC-39 |
| FR-027 | Penanganan Prompt Login/Consent | UC-14, UC-15 |
| FR-028 | Error Response Authorization yang Standar | UC-15, UC-16, UC-17, UC-21 |

### E. Token Lifecycle

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-029 | Exchange Code ke Token | UC-22, UC-30 |
| FR-030 | ID Token Claims & Signing | UC-19, UC-23 |
| FR-031 | Profil JWT Access Token | UC-24, UC-32 |
| FR-032 | Rotasi Refresh Token | UC-25, UC-33 |
| FR-033 | Deteksi Penyalahgunaan Refresh Token | UC-26, UC-71 |
| FR-034 | Endpoint Pencabutan Token | UC-06, UC-09, UC-27, UC-39, UC-76 |
| FR-035 | Endpoint UserInfo | UC-24, UC-29 |
| FR-036 | Endpoint Token Introspection | UC-28, UC-29 |
| FR-037 | Binding Token ke Session & Client | UC-32, UC-45, UC-46 |
| FR-038 | Kebijakan Masa Berlaku Token | UC-25, UC-33, UC-49, UC-62 |

### F. Session & Logout

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-039 | Session SSO & SID | UC-11, UC-43, UC-49 |
| FR-040 | Registry Session Aplikasi Client | UC-44, UC-46 |
| FR-041 | Logout dari Aplikasi Client | UC-45 |
| FR-042 | Back-channel Logout | UC-46, UC-48 |
| FR-043 | Front-channel Logout Fallback | UC-46, UC-47 |
| FR-044 | Audit & Idempotency Global Logout | UC-26, UC-40, UC-45, UC-48, UC-50, UC-76 |

### G. User Profile & Self-Service

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-045 | Lihat Profil User | UC-34 |
| FR-046 | Ubah & Verifikasi Profil | UC-35, UC-54 |
| FR-047 | Ganti & Reset Password | UC-20, UC-36, UC-37, UC-71 |
| FR-048 | Connected Apps & Active Sessions | UC-38, UC-39, UC-40, UC-70 |
| FR-049 | Workflow Hak Data Pribadi | UC-41, UC-42, UC-65 |

### H. Admin & Governance

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-050 | Dashboard Admin | UC-52 |
| FR-051 | Manajemen Lifecycle User | UC-50, UC-53, UC-54, UC-55 |
| FR-052 | Audit Log, Export & Retention | UC-26, UC-41, UC-42, UC-57, UC-58, UC-59, UC-63, UC-65, UC-79 |
| FR-053 | RBAC Admin & Authorization | UC-51, UC-52, UC-56, UC-57, UC-73 |
| FR-054 | Console Kelola Client | UC-03, UC-04, UC-05, UC-60, UC-61 |
| FR-055 | Kelola Security Policy | UC-62, UC-68, UC-70 |
| FR-056 | Monitoring Health & Incident Action | UC-65, UC-75, UC-77, UC-78, UC-80, UC-82, UC-83 |

### I. External IdP Integration

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-057 | Konfigurasi Discovery IdP Eksternal | UC-81 |
| FR-058 | Mapping Login Federasi | UC-81 |
| FR-059 | Failover & Disable Federasi | UC-81, UC-82 |

### J. Error Handling & UX

| FR ID | Nama Requirement | Use Case Terkait |
| --- | --- | --- |
| FR-060 | Taksonomi Error OAuth/OIDC | UC-16, UC-17, UC-29, UC-30 |
| FR-061 | UX Error untuk User & Lokalisasi | UC-18, UC-21, UC-74 |
| FR-062 | Pesan Error Aman | UC-30, UC-63 |
| FR-063 | Diagnostik Developer & Correlation ID | UC-63, UC-82 |

---

## 7. Candidate Gap Register Praktis

| Gap ID | Area | Related | Severity | Phase | Audit Note |
|---|---|---|---|---|---|
| GAP-01 | Token Introspection | FR-036 / UC-28 | Major | Phase-2 | Endpoint belum ada menurut blueprint; perlu endpoint, auth caller, rate limit, tests. |
| GAP-02 | Back-channel logout sid audit end-to-end | FR-042 / UC-46 | Minor-Major | MVP | Dispatcher ada menurut blueprint, tetapi konsistensi sid dan audit perlu dibuktikan. |
| GAP-03 | Consent Revocation UI | FR-026 / UC-39 | Major | MVP/Phase-2 | Perlu portal connected apps, revoke consent, token impact policy. |
| GAP-04 | MFA admin baseline | FR-018 / FR-019 / UC-73 | Critical untuk admin | MVP gate atau Phase-2 hard gate | Admin privileged sebaiknya tidak production tanpa MFA atau break-glass governance. |
| GAP-05 | Audit retention job dan PII redaction | FR-052 / FR-049 | Major | MVP | Schema saja tidak cukup; perlu retention, deletion/anonymization, integrity scan. |
| GAP-06 | Security notification | UC-71 | Minor-Major | Phase-2 | Dibutuhkan untuk password reset, MFA change, token reuse, suspicious login. |
| GAP-07 | DR/restore drill evidence | UC-78 / UC-83 | Major | MVP/Phase-2 | Backup tanpa restore drill belum memenuhi operability evidence. |
| GAP-08 | Policy management versioning | FR-055 | Minor | Phase-2 | Diperlukan agar MFA/rate/token lifetime tidak hardcoded dan bisa diaudit. |

---

## 8. Appendix A — Mapping ID Baru ke Kode Asal

Mapping ini disediakan agar dokumen praktis tetap bisa dihubungkan ke dokumen teknis/detail sebelumnya.

### 8.1 Mapping Functional Requirement

| ID Baru | Kode Asal | Nama Praktis | Nama Teknis/Asal | Domain |
| --- | --- | --- | --- | --- |
| FR-001 | FR-D-01 | Publikasi OIDC Discovery | OIDC Discovery Metadata | A. Discovery & Metadata |
| FR-002 | FR-D-02 | Publikasi JWKS Signing Key | JWKS Endpoint dan Key Publication | A. Discovery & Metadata |
| FR-003 | FR-D-03 | Ketersediaan Discovery & JWKS | Metadata Availability dan Cache Strategy | A. Discovery & Metadata |
| FR-004 | FR-D-04 | Registry Scope, Claim & Algorithm | Registry Scope, Claim, dan Algorithm | A. Discovery & Metadata |
| FR-005 | FR-D-05 | Konsistensi Issuer & Endpoint | Issuer dan Endpoint Canonicalization | A. Discovery & Metadata |
| FR-006 | FR-C-01 | Kelola Client Aplikasi oleh Admin | Client CRUD Terkontrol Admin | B. Client Management |
| FR-007 | FR-C-02 | Validasi Tipe Client & Auth Token Endpoint | Enforcement Client Type dan Token Endpoint Auth | B. Client Management |
| FR-008 | FR-C-03 | Validasi Redirect URI Exact Match | Redirect URI Exact Matching | B. Client Management |
| FR-009 | FR-C-04 | Siklus Hidup Client Secret | Client Secret Lifecycle | B. Client Management |
| FR-010 | FR-C-05 | Validasi Logout URI Client | Logout URI Registration dan Validation | B. Client Management |
| FR-011 | FR-C-06 | Kebijakan Scope & Consent per Client | Scope dan Consent Policy per Client | B. Client Management |
| FR-012 | FR-C-07 | Suspend & Decommission Client | Client Suspension dan Decommission | B. Client Management |
| FR-013 | FR-A-01 | Login OIDC via Authorization Code + PKCE | Authorization Code Flow dengan PKCE Mandatory | C. Authentication |
| FR-014 | FR-A-02 | Login Password Lokal | Login Password Lokal | C. Authentication |
| FR-015 | FR-A-03 | Password Policy & Penyimpanan Argon2id | Password Policy dan Argon2id Storage | C. Authentication |
| FR-016 | FR-A-04 | Proteksi Brute Force & Rate Limit | Brute-force Protection dan Rate Limiting | C. Authentication |
| FR-017 | FR-A-05 | Keamanan Cookie Session | Session Cookie Security | C. Authentication |
| FR-018 | FR-A-06 | Pendaftaran MFA | MFA Enrollment | C. Authentication |
| FR-019 | FR-A-07 | Verifikasi MFA saat Login | MFA Challenge dan Verification | C. Authentication |
| FR-020 | FR-A-08 | Recovery Code & Pemulihan MFA | Recovery Codes dan Factor Recovery | C. Authentication |
| FR-021 | FR-A-09 | Step-up Authentication | Step-up Authentication via `acr_values` dan `max_age` | C. Authentication |
| FR-022 | FR-A-10 | Lock/Disable Akun & Lifecycle Credential | Account Lock, Disable, dan Credential Lifecycle | C. Authentication |
| FR-023 | FR-Z-01 | Validasi Authorization Request | Authorization Request Validation | D. Authorization & Consent |
| FR-024 | FR-Z-02 | Penerbitan Authorization Code | Authorization Code Issuance | D. Authorization & Consent |
| FR-025 | FR-Z-03 | Enforcement Scope & Claim | Scope dan Claim Enforcement | D. Authorization & Consent |
| FR-026 | FR-Z-04 | Pencatatan & Pencabutan Consent | Consent Capture dan Revocation | D. Authorization & Consent |
| FR-027 | FR-Z-05 | Penanganan Prompt Login/Consent | Prompt Handling | D. Authorization & Consent |
| FR-028 | FR-Z-06 | Error Response Authorization yang Standar | Authorization Error Response Semantics | D. Authorization & Consent |
| FR-029 | FR-T-01 | Exchange Code ke Token | Token Endpoint Code Exchange | E. Token Lifecycle |
| FR-030 | FR-T-02 | ID Token Claims & Signing | ID Token Claims dan Signing | E. Token Lifecycle |
| FR-031 | FR-T-03 | Profil JWT Access Token | JWT Access Token Profile | E. Token Lifecycle |
| FR-032 | FR-T-04 | Rotasi Refresh Token | Refresh Token Rotation | E. Token Lifecycle |
| FR-033 | FR-T-05 | Deteksi Penyalahgunaan Refresh Token | Refresh Token Reuse Detection | E. Token Lifecycle |
| FR-034 | FR-T-06 | Endpoint Pencabutan Token | Token Revocation Endpoint | E. Token Lifecycle |
| FR-035 | FR-T-07 | Endpoint UserInfo | UserInfo Endpoint | E. Token Lifecycle |
| FR-036 | FR-T-08 | Endpoint Token Introspection | Token Introspection | E. Token Lifecycle |
| FR-037 | FR-T-09 | Binding Token ke Session & Client | Token Binding ke Session dan Client | E. Token Lifecycle |
| FR-038 | FR-T-10 | Kebijakan Masa Berlaku Token | Token Lifetime Policy | E. Token Lifecycle |
| FR-039 | FR-S-01 | Session SSO & SID | SSO Session dan `sid` | F. Session & Logout |
| FR-040 | FR-S-02 | Registry Session Aplikasi Client | RP Session Registry | F. Session & Logout |
| FR-041 | FR-S-03 | Logout dari Aplikasi Client | RP-Initiated Logout | F. Session & Logout |
| FR-042 | FR-S-04 | Back-channel Logout | Back-Channel Logout | F. Session & Logout |
| FR-043 | FR-S-05 | Front-channel Logout Fallback | Front-Channel Logout Fallback | F. Session & Logout |
| FR-044 | FR-S-06 | Audit & Idempotency Global Logout | Global Logout Idempotency dan Audit | F. Session & Logout |
| FR-045 | FR-P-01 | Lihat Profil User | Profile View | G. User Profile & Self-Service |
| FR-046 | FR-P-02 | Ubah & Verifikasi Profil | Profile Update dan Verification | G. User Profile & Self-Service |
| FR-047 | FR-P-03 | Ganti & Reset Password | Password Change dan Reset | G. User Profile & Self-Service |
| FR-048 | FR-P-04 | Connected Apps & Active Sessions | Connected Apps dan Active Sessions | G. User Profile & Self-Service |
| FR-049 | FR-P-05 | Workflow Hak Data Pribadi | Data Subject Rights Workflow | G. User Profile & Self-Service |
| FR-050 | FR-G-01 | Dashboard Admin | Admin Dashboard | H. Admin & Governance |
| FR-051 | FR-G-02 | Manajemen Lifecycle User | User Lifecycle Management | H. Admin & Governance |
| FR-052 | FR-G-03 | Audit Log, Export & Retention | Audit Log Query, Export, dan Retention | H. Admin & Governance |
| FR-053 | FR-G-04 | RBAC Admin & Authorization | RBAC Admin Authorization | H. Admin & Governance |
| FR-054 | FR-G-05 | Console Kelola Client | Admin Client Management Console | H. Admin & Governance |
| FR-055 | FR-G-06 | Kelola Security Policy | Security Policy Management | H. Admin & Governance |
| FR-056 | FR-G-07 | Monitoring Health & Incident Action | Operational Health dan Incident Actions | H. Admin & Governance |
| FR-057 | FR-F-01 | Konfigurasi Discovery IdP Eksternal | External IdP OIDC Discovery Configuration | I. External IdP Integration |
| FR-058 | FR-F-02 | Mapping Login Federasi | Federated Login Mapping | I. External IdP Integration |
| FR-059 | FR-F-03 | Failover & Disable Federasi | Federation Failover dan Disable | I. External IdP Integration |
| FR-060 | FR-E-01 | Taksonomi Error OAuth/OIDC | OAuth/OIDC Error Taxonomy | J. Error Handling & UX |
| FR-061 | FR-E-02 | UX Error untuk User & Lokalisasi | User-Facing Error UX dan Localization | J. Error Handling & UX |
| FR-062 | FR-E-03 | Pesan Error Aman | Security-Safe Error Messages | J. Error Handling & UX |
| FR-063 | FR-E-04 | Diagnostik Developer & Correlation ID | Developer Diagnostics dan Correlation | J. Error Handling & UX |

### 8.2 Mapping Use Case

| ID Baru | Kode Asal | Nama Praktis | Nama Teknis/Asal | Domain |
| --- | --- | --- | --- | --- |
| UC-01 | UC-A-01 | Lihat OIDC Discovery | RP Mengambil OIDC Discovery | A. Discovery & Client Configuration |
| UC-02 | UC-A-02 | Lihat JWKS | RP Mengambil JWKS dan Memvalidasi `kid` | A. Discovery & Client Configuration |
| UC-03 | UC-A-03 | Kelola Client Aplikasi Baru | Admin Mendaftarkan Client Baru | A. Discovery & Client Configuration |
| UC-04 | UC-A-04 | Kelola Redirect/Logout URI Client | Admin Mengubah Redirect/Logout URI | A. Discovery & Client Configuration |
| UC-05 | UC-A-05 | Kelola Client Secret | Admin Merotasi Client Secret | A. Discovery & Client Configuration |
| UC-06 | UC-A-06 | Suspend Client | Admin Suspend Client | A. Discovery & Client Configuration |
| UC-07 | UC-A-07 | Kelola Scope & Consent Client | Admin Mengatur Scope/Consent Policy | A. Discovery & Client Configuration |
| UC-08 | UC-A-08 | Validasi Issuer & Metadata Client | RP Memvalidasi Issuer dan Metadata Consistency | A. Discovery & Client Configuration |
| UC-09 | UC-A-09 | Decommission Client | Admin Decommission Client | A. Discovery & Client Configuration |
| UC-10 | UC-B-01 | Memulai Authorization Request | Memulai Authorization Code Flow + PKCE | B. Authentication & Authorization |
| UC-11 | UC-B-02 | Login via Portal SSO | Login via Portal SSO dengan Password Lokal | B. Authentication & Authorization |
| UC-12 | UC-B-03 | Melanjutkan Authorization Setelah Login | Resume Authorization Setelah Login | B. Authentication & Authorization |
| UC-13 | UC-B-04 | Menampilkan dan Menyetujui Consent | User Memberi Consent Scope | B. Authentication & Authorization |
| UC-14 | UC-B-05 | Paksa Login Ulang | Force Re-auth dengan `prompt=login` | B. Authentication & Authorization |
| UC-15 | UC-B-06 | Silent Authentication | Silent Auth dengan `prompt=none` | B. Authentication & Authorization |
| UC-16 | UC-B-07 | Tolak Redirect URI Tidak Valid | Invalid Redirect URI Rejection | B. Authentication & Authorization |
| UC-17 | UC-B-08 | Tolak PKCE/State/Nonce Tidak Valid | Invalid PKCE/State/Nonce Rejection | B. Authentication & Authorization |
| UC-18 | UC-B-09 | Menangani Akun Terkunci saat Login | Account Locked Saat Login | B. Authentication & Authorization |
| UC-19 | UC-B-10 | Step-up Authentication | Step-up Auth via `acr_values`/`max_age` | B. Authentication & Authorization |
| UC-20 | UC-B-11 | Force Change Password Expired | Password Expired Force Change | B. Authentication & Authorization |
| UC-21 | UC-B-12 | User Menolak Consent | User Menolak Authorization/Consent | B. Authentication & Authorization |
| UC-22 | UC-C-01 | Tukar Authorization Code menjadi Token | Exchange Authorization Code for Token | C. Token Lifecycle |
| UC-23 | UC-C-02 | Validasi ID Token | RP Memvalidasi ID Token | C. Token Lifecycle |
| UC-24 | UC-C-03 | Akses UserInfo | Client Mengakses UserInfo | C. Token Lifecycle |
| UC-25 | UC-C-04 | Refresh Token dengan Rotation | Refresh Token Rotation | C. Token Lifecycle |
| UC-26 | UC-C-05 | Deteksi Reuse Refresh Token | Detect Refresh Token Reuse | C. Token Lifecycle |
| UC-27 | UC-C-06 | Cabut Token | Revoke Token | C. Token Lifecycle |
| UC-28 | UC-C-07 | Validasi Token via Introspection | Resource Server Melakukan Introspection | C. Token Lifecycle |
| UC-29 | UC-C-08 | Tangani Token Expired/Unknown | Expired/Unknown Token Handling | C. Token Lifecycle |
| UC-30 | UC-C-09 | Tangani Client Auth Gagal | Client Auth Failure di Token Endpoint | C. Token Lifecycle |
| UC-31 | UC-C-10 | Validasi Token saat Key Rotation | Key Rotation Saat Token Validation | C. Token Lifecycle |
| UC-32 | UC-C-11 | Tolak Token Wrong Audience | Wrong Audience Token Rejection | C. Token Lifecycle |
| UC-33 | UC-C-12 | Terapkan Masa Berlaku Token | Token Lifetime Enforcement | C. Token Lifecycle |
| UC-34 | UC-D-01 | Lihat Profil | User Melihat Profile | D. Profile & User Self-Service |
| UC-35 | UC-D-02 | Ubah Profil | User Mengubah Profile | D. Profile & User Self-Service |
| UC-36 | UC-D-03 | Ganti Password | User Mengganti Password | D. Profile & User Self-Service |
| UC-37 | UC-D-04 | Reset Password | User Reset Password | D. Profile & User Self-Service |
| UC-38 | UC-D-05 | Lihat Connected Apps | User Melihat Connected Apps | D. Profile & User Self-Service |
| UC-39 | UC-D-06 | Cabut Consent Aplikasi | User Revoke App Consent | D. Profile & User Self-Service |
| UC-40 | UC-D-07 | Lihat dan Tutup Active Sessions | User Melihat dan Menutup Active Sessions | D. Profile & User Self-Service |
| UC-41 | UC-D-08 | Request Export Data Pribadi | User Request Export Data Pribadi | D. Profile & User Self-Service |
| UC-42 | UC-D-09 | Request Hapus/Anonim Akun | User Request Account Deletion/Anonymization | D. Profile & User Self-Service |
| UC-43 | UC-E-01 | Buat Session SSO & SID | Create SSO Session dan SID | E. Session & Logout |
| UC-44 | UC-E-02 | Register Session Aplikasi Client | Register RP Session | E. Session & Logout |
| UC-45 | UC-E-03 | Logout dari Aplikasi Client | RP-Initiated Logout | E. Session & Logout |
| UC-46 | UC-E-04 | Kirim Back-channel Logout ke Semua Client | Back-channel Logout Dispatch ke Semua Client | E. Session & Logout |
| UC-47 | UC-E-05 | Jalankan Front-channel Logout Fallback | Front-channel Logout Fallback | E. Session & Logout |
| UC-48 | UC-E-06 | Tangani Logout Idempotent/Race | Logout Idempotency dan Race Handling | E. Session & Logout |
| UC-49 | UC-E-07 | Terapkan Session Expiry & Idle Timeout | Session Expiry dan Idle Timeout | E. Session & Logout |
| UC-50 | UC-E-08 | Admin Tutup Session User | Admin Terminate Session | E. Session & Logout |
| UC-51 | UC-F-01 | Admin Login | Admin Login | F. Admin Management |
| UC-52 | UC-F-02 | Admin Lihat Dashboard | Admin Melihat Dashboard | F. Admin Management |
| UC-53 | UC-F-03 | Admin Buat User | Admin Create User | F. Admin Management |
| UC-54 | UC-F-04 | Admin Ubah Data User | Admin Update User Attributes | F. Admin Management |
| UC-55 | UC-F-05 | Admin Lock/Unlock User | Admin Lock/Unlock User | F. Admin Management |
| UC-56 | UC-F-06 | Admin Assign Role | Admin Assign Roles | F. Admin Management |
| UC-57 | UC-F-07 | Review Matriks RBAC | Security Officer Review RBAC Matrix | F. Admin Management |
| UC-58 | UC-F-08 | Admin Lihat Audit Log | Admin View Audit Logs | F. Admin Management |
| UC-59 | UC-F-09 | Admin Export Audit Log | Admin Export Audit Logs | F. Admin Management |
| UC-60 | UC-F-10 | Admin Konfigurasi Client | Admin Configure Client | F. Admin Management |
| UC-61 | UC-F-11 | Admin Rotasi Client Secret | Admin Rotate Client Secret | F. Admin Management |
| UC-62 | UC-F-12 | Admin Kelola Security Policy | Admin Configure Security Policy | F. Admin Management |
| UC-63 | UC-F-13 | Investigasi Incident dengan Correlation ID/SID | Investigasi Incident dengan Correlation ID/SID | F. Admin Management |
| UC-64 | UC-F-14 | Operator Kelola Key Rotation | Operator Manage Key Rotation | F. Admin Management |
| UC-65 | UC-F-15 | Generate Compliance Evidence Pack | Generate Compliance Evidence Pack | F. Admin Management |
| UC-66 | UC-G-01 | Daftar MFA | MFA Enrollment | G. Security & Risk |
| UC-67 | UC-G-02 | Verifikasi Login dengan MFA | Verifikasi Login dengan MFA | G. Security & Risk |
| UC-68 | UC-G-03 | Evaluasi Risk Score | Risk Score Evaluation | G. Security & Risk |
| UC-69 | UC-G-04 | Recovery MFA/Lost Factor | MFA Recovery / Lost Factor | G. Security & Risk |
| UC-70 | UC-G-05 | Kelola Device | Device Management | G. Security & Risk |
| UC-71 | UC-G-06 | Kirim Security Notification | Security Notification | G. Security & Risk |
| UC-72 | UC-G-07 | Challenge Login Mencurigakan | Suspicious Login Challenge | G. Security & Risk |
| UC-73 | UC-G-08 | Wajib MFA untuk Admin | Admin Mandatory MFA | G. Security & Risk |
| UC-74 | UC-G-09 | Respon Rate Limit/Throttle | Rate Limit / Throttle Response | G. Security & Risk |
| UC-75 | UC-G-10 | Kelola IP Blocklist/Allowlist | Abuse IP Blocklist / Allowlist Control | G. Security & Risk |
| UC-76 | UC-G-11 | Emergency Credential Reset | Emergency Credential Reset | G. Security & Risk |
| UC-77 | UC-H-01 | Monitor SLI Endpoint OIDC | Monitoring OIDC Endpoint SLI | H. Integration & Operations |
| UC-78 | UC-H-02 | Backup & Restore Identity Store | Backup dan Restore Identity Store | H. Integration & Operations |
| UC-79 | UC-H-03 | Export Log ke SIEM | SIEM Export | H. Integration & Operations |
| UC-80 | UC-H-04 | Drill Rotasi JWKS Key | JWKS Key Rotation Drill | H. Integration & Operations |
| UC-81 | UC-H-05 | Pilot Federation External IdP | Federation Pilot | H. Integration & Operations |
| UC-82 | UC-H-06 | Jalankan Incident Runbook SEV | Incident Runbook SEV | H. Integration & Operations |
| UC-83 | UC-H-07 | DR Failover | DR Failover | H. Integration & Operations |

---

## 9. Appendix B — Detail Singkat per Use Case

Bagian ini opsional untuk pembaca yang ingin tahu FR terkait tanpa membuka dokumen teknis detail.

### A. Discovery & Client Configuration

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-01 | Lihat OIDC Discovery | A-03 / A-04 | Tinggi / MVP | FR-001, FR-003, FR-005 |
| UC-02 | Lihat JWKS | A-03 / A-04 | Tinggi / MVP | FR-002, NFR-SEC-03 |
| UC-03 | Kelola Client Aplikasi Baru | A-02 | Tinggi / MVP | FR-006, FR-054 |
| UC-04 | Kelola Redirect/Logout URI Client | A-02 | Tinggi / MVP | FR-008, FR-010, FR-054 |
| UC-05 | Kelola Client Secret | A-02 | Tinggi / MVP | FR-009, FR-054 |
| UC-06 | Suspend Client | A-02 | Tinggi / MVP | FR-012, FR-034 |
| UC-07 | Kelola Scope & Consent Client | A-02 | Tinggi / MVP | FR-004, FR-011, FR-025 |
| UC-08 | Validasi Issuer & Metadata Client | A-03 / A-04 | Tinggi / MVP | FR-001, FR-005 |
| UC-09 | Decommission Client | A-02 | Sedang / MVP | FR-012, FR-034 |

### B. Authentication & Authorization

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-10 | Memulai Authorization Request | A-01 via RP | Tinggi / MVP | FR-013, FR-023 |
| UC-11 | Login via Portal SSO | A-01 | Tinggi / MVP | FR-014, FR-016, FR-017, FR-039 |
| UC-12 | Melanjutkan Authorization Setelah Login | A-01 | Tinggi / MVP | FR-024, FR-026 |
| UC-13 | Menampilkan dan Menyetujui Consent | A-01 | Tinggi / MVP | FR-011, FR-025, FR-026 |
| UC-14 | Paksa Login Ulang | A-01 | Tinggi / MVP | FR-021, FR-027 |
| UC-15 | Silent Authentication | A-03 / A-04 | Sedang / MVP | FR-027, FR-028 |
| UC-16 | Tolak Redirect URI Tidak Valid | A-03 / A-04 | Tinggi / MVP | FR-008, FR-023, FR-028 |
| UC-17 | Tolak PKCE/State/Nonce Tidak Valid | A-03 / A-04 | Tinggi / MVP | FR-013, FR-023, FR-060 |
| UC-18 | Menangani Akun Terkunci saat Login | A-01 | Tinggi / MVP | FR-016, FR-022, FR-061 |
| UC-19 | Step-up Authentication | A-01 | Sedang / Phase-2 | FR-019, FR-021, FR-030 |
| UC-20 | Force Change Password Expired | A-01 | Sedang / MVP | FR-015, FR-022, FR-047 |
| UC-21 | User Menolak Consent | A-01 | Tinggi / MVP | FR-026, FR-028, FR-061 |

### C. Token Lifecycle

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-22 | Tukar Authorization Code menjadi Token | A-03 / A-04 | Tinggi / MVP | FR-013, FR-024, FR-029 |
| UC-23 | Validasi ID Token | A-03 / A-04 | Tinggi / MVP | FR-002, FR-005, FR-030 |
| UC-24 | Akses UserInfo | A-03 / A-04 | Tinggi / MVP | FR-025, FR-031, FR-035 |
| UC-25 | Refresh Token dengan Rotation | A-03 / A-04 | Tinggi / MVP | FR-032, FR-038 |
| UC-26 | Deteksi Reuse Refresh Token | A-06 | Tinggi / MVP | FR-033, FR-044, FR-052 |
| UC-27 | Cabut Token | A-03 / A-04 / A-01 | Tinggi / MVP | FR-034 |
| UC-28 | Validasi Token via Introspection | A-12 | Sedang / Phase-2 | FR-036 |
| UC-29 | Tangani Token Expired/Unknown | A-03 / A-04 / A-12 | Tinggi / MVP | FR-035, FR-036, FR-060 |
| UC-30 | Tangani Client Auth Gagal | A-04 | Tinggi / MVP | FR-007, FR-060, FR-062 |
| UC-31 | Validasi Token saat Key Rotation | A-03 / A-04 / A-12 | Tinggi / MVP | FR-002, NFR-SEC-03 |
| UC-32 | Tolak Token Wrong Audience | A-12 | Tinggi / MVP | FR-031, FR-037 |
| UC-33 | Terapkan Masa Berlaku Token | A-06 | Tinggi / MVP | FR-032, FR-038 |

### D. Profile & User Self-Service

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-34 | Lihat Profil | A-01 | Tinggi / MVP | FR-045 |
| UC-35 | Ubah Profil | A-01 | Sedang / MVP | FR-046 |
| UC-36 | Ganti Password | A-01 | Tinggi / MVP | FR-015, FR-047 |
| UC-37 | Reset Password | A-01 | Tinggi / MVP | FR-022, FR-047 |
| UC-38 | Lihat Connected Apps | A-01 | Sedang / Phase-2 | FR-048 |
| UC-39 | Cabut Consent Aplikasi | A-01 | Sedang / Phase-2 | FR-026, FR-034, FR-048 |
| UC-40 | Lihat dan Tutup Active Sessions | A-01 | Sedang / Phase-2 | FR-044, FR-048 |
| UC-41 | Request Export Data Pribadi | A-01 | Tinggi / MVP intake | FR-049, FR-052 |
| UC-42 | Request Hapus/Anonim Akun | A-01 | Tinggi / MVP intake | FR-049, FR-052 |

### E. Session & Logout

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-43 | Buat Session SSO & SID | A-06 | Tinggi / MVP | FR-017, FR-039 |
| UC-44 | Register Session Aplikasi Client | A-06 | Tinggi / MVP | FR-040 |
| UC-45 | Logout dari Aplikasi Client | A-03 / A-04 | Tinggi / MVP | FR-041, FR-044 |
| UC-46 | Kirim Back-channel Logout ke Semua Client | A-06 | Tinggi / MVP | FR-010, FR-042, FR-043 |
| UC-47 | Jalankan Front-channel Logout Fallback | A-06 | Sedang / MVP | FR-043 |
| UC-48 | Tangani Logout Idempotent/Race | A-06 | Tinggi / MVP | FR-042, FR-044 |
| UC-49 | Terapkan Session Expiry & Idle Timeout | A-01 | Tinggi / MVP | FR-038, FR-039 |
| UC-50 | Admin Tutup Session User | A-02 | Tinggi / MVP | FR-022, FR-044, FR-051 |

### F. Admin Management

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-51 | Admin Login | A-02 | Tinggi / MVP | FR-018, FR-019, FR-053 |
| UC-52 | Admin Lihat Dashboard | A-02 | Tinggi / MVP | FR-050, FR-053 |
| UC-53 | Admin Buat User | A-02 | Tinggi / MVP | FR-015, FR-051 |
| UC-54 | Admin Ubah Data User | A-02 | Tinggi / MVP | FR-046, FR-051 |
| UC-55 | Admin Lock/Unlock User | A-02 | Tinggi / MVP | FR-022, FR-051 |
| UC-56 | Admin Assign Role | A-02 | Tinggi / MVP | FR-053 |
| UC-57 | Review Matriks RBAC | A-11 | Sedang / MVP | FR-052, FR-053 |
| UC-58 | Admin Lihat Audit Log | A-02 / A-11 | Tinggi / MVP | FR-052 |
| UC-59 | Admin Export Audit Log | A-11 | Tinggi / MVP | FR-052 |
| UC-60 | Admin Konfigurasi Client | A-02 | Tinggi / MVP | FR-006, FR-054 |
| UC-61 | Admin Rotasi Client Secret | A-02 | Tinggi / MVP | FR-009, FR-054 |
| UC-62 | Admin Kelola Security Policy | A-11 | Sedang / Phase-2 | FR-055 |
| UC-63 | Investigasi Incident dengan Correlation ID/SID | A-11 | Tinggi / MVP | FR-052, FR-063 |
| UC-64 | Operator Kelola Key Rotation | A-10 | Tinggi / MVP | FR-002, NFR-SEC-03 |
| UC-65 | Generate Compliance Evidence Pack | A-11 | Sedang / MVP | FR-049, FR-052, FR-056 |

### G. Security & Risk

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-66 | Daftar MFA | A-01 / A-02 | Sedang / Phase-2; Tinggi Admin | FR-018, FR-019, FR-020 |
| UC-67 | Verifikasi Login dengan MFA | A-01 | Sedang / Phase-2 | FR-018, FR-019, FR-020, FR-021 |
| UC-68 | Evaluasi Risk Score | A-06 | Rendah / Phase-3 | FR-021, FR-055 |
| UC-69 | Recovery MFA/Lost Factor | A-01 | Sedang / Phase-2 | FR-020 |
| UC-70 | Kelola Device | A-01 | Sedang / Phase-2 | FR-048, FR-055 |
| UC-71 | Kirim Security Notification | A-06 | Sedang / Phase-2 | FR-020, FR-033, FR-047 |
| UC-72 | Challenge Login Mencurigakan | A-01 | Rendah / Phase-3 | FR-019, FR-021 |
| UC-73 | Wajib MFA untuk Admin | A-02 | Tinggi / MVP/Phase-2 gate | FR-018, FR-019, FR-053 |
| UC-74 | Respon Rate Limit/Throttle | A-06 | Tinggi / MVP | FR-016, FR-061 |
| UC-75 | Kelola IP Blocklist/Allowlist | A-10 / A-11 | Sedang / Phase-2 | FR-016, FR-056 |
| UC-76 | Emergency Credential Reset | A-11 | Tinggi / MVP | FR-020, FR-022, FR-034, FR-044 |

### H. Integration & Operations

| UC ID | Nama Use Case | Aktor Utama | Prioritas/Fase | FR/NFR Terkait |
| --- | --- | --- | --- | --- |
| UC-77 | Monitor SLI Endpoint OIDC | A-10 | Tinggi / MVP | FR-056, NFR-OBS-01, NFR-PRF-01 |
| UC-78 | Backup & Restore Identity Store | A-10 | Tinggi / MVP | FR-056, NFR-AVA-02 |
| UC-79 | Export Log ke SIEM | A-10 / A-11 | Tinggi / MVP | FR-052, NFR-OBS-02 |
| UC-80 | Drill Rotasi JWKS Key | A-10 | Tinggi / MVP | FR-002, NFR-SEC-03 |
| UC-81 | Pilot Federation External IdP | A-10 / A-11 | Rendah / Phase-3 | FR-057, FR-058, FR-059 |
| UC-82 | Jalankan Incident Runbook SEV | A-10 / A-11 | Tinggi / MVP | FR-056, FR-063 |
| UC-83 | DR Failover | A-10 | Sedang / Phase-2 | FR-056, NFR-AVA-02 |

---

_Last verified by repo audit: 2026-05-17 — see `docs/audits/fr-001-fr-063-gap-audit.md`._
