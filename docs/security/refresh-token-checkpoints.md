# Refresh Token Checkpoints

Tanggal audit: 2026-04-27

Dokumen ini menjadi evidence untuk lifecycle refresh token pada App A, SSO broker,
dan browser boundary. Prinsip yang dipakai adalah BFF-first: browser hanya memegang
cookie sesi opaque, sedangkan access token, ID token, dan refresh token tetap
server-side.

Referensi prinsip:

- RFC 9700 / OAuth 2.0 Security BCP: public client refresh token harus
  sender-constrained atau memakai refresh token rotation.
- OWASP HTML5 Security Cheat Sheet: session identifier tidak disimpan di local
  storage; cookie `HttpOnly` dapat memitigasi akses JavaScript.

## 1. Secure Storage

- App A memakai cookie `__Host-app-a-session` dengan `HttpOnly`, `Secure`,
  `SameSite=Lax`, dan tanpa `Domain`.
- Cookie hanya berisi session id opaque. Refresh token tidak pernah ditulis ke
  `localStorage`, `sessionStorage`, atau `document.cookie`.
- Session material disimpan server-side di Redis App A. Browser-storage guard CI
  tetap menolak penulisan token ke Web Storage.

## 2. Silent Refresh

- Route `POST /auth/refresh` melakukan refresh token grant di server.
- Helper `authenticatedFetch()` mengulang request sekali setelah response `401`.
- `SessionRefreshBridge` melakukan refresh diam-diam saat halaman aktif, fokus,
  dan interval ringan sehingga user tidak dilempar ke login untuk access token
  yang hanya kedaluwarsa.

## 3. Token Rotation & Reuse Detection

- App A selalu meminta scope `offline_access`.
- SSO broker menerbitkan refresh token baru pada setiap refresh grant.
- App A menolak response refresh yang tidak membawa refresh token baru.
- SSO broker menyimpan hash refresh token dan mendeteksi reuse token lama dengan
  mencabut token family terkait.
- App A memakai Redis refresh lock agar beberapa tab tidak memakai refresh token
  lama secara bersamaan dan memicu false-positive reuse detection.

## 4. Absolute vs Idle Timeout

- Idle timeout App A default: `604800` detik atau 7 hari.
- Absolute timeout App A default: `2592000` detik atau 30 hari.
- Env override:
  - `APP_A_SESSION_IDLE_TTL_SECONDS`
  - `APP_A_SESSION_ABSOLUTE_TTL_SECONDS`
  - `APP_A_REFRESH_LOCK_TTL_SECONDS`
- Redis TTL selalu mengikuti nilai paling kecil antara sisa idle timeout dan sisa
  absolute timeout.

## 5. Multi-Tab Sync

- `BroadcastChannel("app-a-auth-session")` mengirim event `refreshed` atau
  `expired` ke tab lain.
- Redis lock `app-a:refresh-lock:{sessionId}` membuat refresh grant single-flight
  lintas tab.
- Tab yang kalah lock menunggu session server-side diperbarui, bukan mengirim
  refresh grant kedua dengan token lama.

## Rollback

- Perubahan App A bersifat additive dan tetap memakai cookie/session id yang sama.
- Rollback cukup deploy ulang tag sebelumnya melalui workflow rollback.
- Session legacy tanpa field timeout baru dinormalisasi saat dibaca sehingga
  cutover tidak memaksa logout massal.
