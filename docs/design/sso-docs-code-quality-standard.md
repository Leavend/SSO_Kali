# Standar Mutu Kode & Konten — SSO Docs

**Service:** `services/sso-docs`
**Tanggal:** 2026-06-15 · **Status:** Standar berlaku
**Tujuan:** Menjaga konsistensi, akurasi, dan production-readiness situs dokumentasi.

> Standar ini melengkapi `docs/design/sso-docs-technical-design.md`. "Kode" di sini = konfigurasi VitePress (`config.ts`, theme), skrip (`sync-content.sh`), dan Markdown konten.

---

## 1. Prinsip
1. **Single source of truth** — kebenaran teknis ada di kode/`docs/contracts`. Konten docs **mereferensikan**, tidak menyalin logika yang bisa basi.
2. **Sinkronisasi, bukan duplikasi** — konten dari `docs/developers` & `docs/onboarding` **hanya** masuk via `sync-content.sh`. Jangan edit file hasil sinkron langsung.
3. **Build hijau = wajib** — `docs:build` harus lulus (dead-link gate aktif) sebelum merge.
4. **Tanpa rahasia** — tidak ada secret/kredensial asli; gunakan placeholder.

---

## 2. Standar Konten Markdown
- **Bahasa**: setiap halaman tersedia di `id` (root) dan `en` (subtree) bila masuk nav; jaga paritas struktur heading.
- **Heading**: satu `# H1` per halaman; hierarki tidak melompat (H2→H4 dilarang).
- **Link internal**: relatif & valid (dead-link gate akan menggagalkan build). Link ke onboarding pakai pola yang dikenali `sync-content.sh`.
- **Code fence**: selalu beri bahasa (```ts, ```bash, ```http) untuk highlight & lint.
- **Contoh `.env` / secret**: placeholder eksplisit (`SSO_CLIENT_SECRET=<your-client-secret>`), beri komentar "public client: tidak ada secret" bila relevan.
- **Endpoint**: kutip dari **discovery** (`/.well-known/openid-configuration`), jangan hardcode path yang bisa drift.
- **Akurasi**: bila menyebut perilaku backend, rujuk file/kontrak (`docs/contracts/*`) agar bisa diverifikasi.

---

## 3. Standar Kode (config & skrip)
- **`config.ts`**: TypeScript ketat; nav/sidebar id ↔ en sinkron; tidak menonaktifkan dead-link check.
- **`sync-content.sh`**: `set -euo pipefail`, gagal-cepat saat sumber hilang, **idempoten** (boleh dijalankan berulang), kutip variabel (`"${VAR}"`), gunakan `mktemp` untuk rewrite.
- **Theme** (`.vitepress/theme`): override minimal; hindari skrip/font pihak ketiga render-blocking (selaras audit performa ISS-PERF3).
- **Dependency**: kunci versi (`package-lock.json` di-commit); update VitePress lewat PR terpisah.

---

## 4. Definition of Done (per perubahan docs)
- [ ] `npm run sync-content` dijalankan bila menyentuh konten tersinkron.
- [ ] `npm run docs:build` **lulus** (tanpa dead link / warning).
- [ ] Paritas `id`/`en` terjaga untuk halaman ber-nav.
- [ ] Tidak ada secret asli; semua contoh memakai placeholder.
- [ ] File konten baru sudah **`git add`** (ingat `status.showUntrackedFiles=no` — cek `git ls-files --others`).
- [ ] Link & code fence diberi bahasa; heading rapi.

---

## 5. Gate CI yang Direkomendasikan
Pipeline minimal (mis. GitHub Actions `docs.yml`) — saat ini belum ada, jadikan target:
```yaml
# .github/workflows/docs.yml (rekomendasi)
steps:
  - run: npm ci            # services/sso-docs
  - run: npm run sync-content
  - run: npm run docs:build         # dead-link gate
  # opsional, mutu konten:
  - run: npx markdownlint-cli2 "**/*.md"     # gaya markdown
  - run: npx prettier --check "**/*.md"      # format konsisten
  - run: npx lychee --offline .              # cek link tambahan (eksternal)
```
**Catatan:** dead-link gate VitePress sudah menahan link internal rusak; markdownlint/prettier/lychee bersifat opsional-direkomendasikan untuk gaya & link eksternal.

---

## 6. Production-Readiness (penyajian)
Mengacu `nginx.conf` service ini sebagai **standar emas** lintas frontend:
- gzip on (target: + brotli), immutable cache aset hashed, HTML no-cache, security headers.
- Tidak ada aset render-blocking tak perlu.

---

## 7. File Referensi
| File | Topik |
|---|---|
| `services/sso-docs/.vitepress/config.ts` | i18n/nav/sidebar, dead-link |
| `services/sso-docs/sync-content.sh` | sinkronisasi konten |
| `services/sso-docs/nginx.conf` | standar penyajian |
| `docs/design/sso-docs-technical-design.md` | TDD service |
| `docs/contracts/**` | kontrak teknis yang dirujuk konten |

---

_Standar dibuat 2026-06-15. Inti: docs **mereferensikan** kebenaran (bukan menyalin), konten masuk hanya via `sync-content.sh` (sinkron, bukan duplikasi), build wajib hijau dgn dead-link gate, tanpa rahasia asli, paritas id/en, dan penyajian nginx (gzip + immutable cache) sebagai acuan. CI docs (sync→build→lint) direkomendasikan ditambahkan. Pendamping: `sso-docs-technical-design.md` & `sso-backend-technical-design.md`._
