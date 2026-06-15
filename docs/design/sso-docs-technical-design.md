# Technical Design Document — SSO Docs

**Service:** `services/sso-docs` · **Domain:** `docs.sso.timeh.my.id`
**Tanggal:** 2026-06-15 · **Status:** Living document
**Stack:** VitePress 1.6, Vue 3, nginx (penyajian statis)

---

## 1. Overview

`sso-docs` adalah **situs dokumentasi developer** (VitePress) untuk integrator yang menyambungkan aplikasi ke Dev-SSO. Bersifat **i18n (id + en)**, di-build menjadi statis, dan disajikan oleh **nginx** (gzip + immutable cache).

### 1.1 Goals
- Sumber tunggal panduan integrasi: onboarding, OIDC flow, scopes/claims, error taxonomy, resource server, security model.
- **Konten tidak diduplikasi manual** — disinkronkan dari `docs/developers` & `docs/onboarding` via `sync-content.sh`.
- Build **gagal** bila ada **dead link** (VitePress strict) → dokumen selalu konsisten.
- Production-ready penyajian: kompresi + cache benar (sudah tercapai, lihat §6).

### 1.2 Non-Goals
- Bukan app interaktif/berstate; murni statis.
- Bukan sumber kebenaran teknis — itu ada di kode & `docs/contracts`. Docs mereferensikan, tidak menggandakan logika.

---

## 2. Arsitektur Konten

```
docs/developers/**   ─┐
docs/onboarding/**   ─┤  sync-content.sh (rewrite link, salin)
                      └─►  services/sso-docs/**  (sumber VitePress)
                              └─ vitepress build ─► .vitepress/dist (statis)
                                    └─ Dockerfile ─► nginx (nginx.conf) ─► docs.sso.timeh.my.id
```

- **`sync-content.sh`** (`set -euo pipefail`): menyalin konten dari `${CONTENT_SOURCE_ROOT:-docs}/{developers,onboarding}` ke service, **menulis ulang link relatif** (mis. `../onboarding/...` → target VitePress). Idempoten; gagal-cepat bila direktori sumber hilang.
- **i18n** (`.vitepress/config.ts`): root locale `id` (lang `id`) + `en` (subtree), masing-masing punya `nav` + `sidebar`.
- **Dead-link checking**: VitePress strict (tanpa `ignoreDeadLinks`) → file tak ter-track / link rusak = build gagal. (Catatan ops: repo memakai `status.showUntrackedFiles=no`; pastikan file konten **ter-`git add`** sebelum build CI.)

---

## 3. Build & Run
| Perintah | Fungsi |
|---|---|
| `npm run sync-content` | sinkronkan konten dari `docs/**` |
| `npm run docs:dev` | dev server (HMR) |
| `npm run docs:build` | build statis ke `.vitepress/dist` (gagal bila dead link) |
| `npm run docs:preview` | preview hasil build |

Pipeline produksi: `sync-content` → `docs:build` → image Docker (`Dockerfile`) → nginx menyajikan `.vitepress/dist`.

---

## 4. Penyajian (nginx)
`services/sso-docs/nginx.conf` — **sudah production-ready**:
- `gzip on` (comp_level 6, types lengkap termasuk `application/javascript`, `image/svg+xml`).
- `/assets/*.<hash>.<ext>` → `Cache-Control: public, max-age=31536000, immutable`; aset lain 30d.
- HTML → `no-cache` (selalu fresh).
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- SPA fallback: `try_files $uri $uri/ $uri.html /index.html`.

> nginx.conf ini dijadikan **acuan standar header/kompresi** untuk portal & admin BFF (lihat audit performa 2026-06-15, ISS-PERF7).

---

## 5. Keamanan
- Situs **publik, read-only**; tak ada kredensial/rahasia di konten.
- **Dilarang** memuat contoh dengan secret asli; gunakan placeholder (`<your-client-secret>`).
- Tak ada font/skrip pihak ketiga render-blocking yang tak perlu (selaraskan dgn ISS-PERF3 audit performa).
- CSP/headers ditegakkan di nginx (lihat §4).

---

## 6. Production-Readiness Checklist
- [x] Kompresi (gzip) aktif · [ ] (opsional) tambah brotli.
- [x] Immutable cache untuk aset hashed; HTML no-cache.
- [x] Security headers dasar.
- [x] Dead-link gate (build gagal bila link rusak).
- [ ] CI menjalankan `sync-content` + `docs:build` + lint (lihat standar mutu).
- [ ] Healthcheck container (mengikuti pola service lain).

---

## 7. Risiko
| Risiko | Mitigasi |
|---|---|
| Konten drift dari sumber `docs/**` | Jalankan `sync-content` di CI; jangan edit file tersinkron langsung |
| Build gagal karena untracked file (`showUntrackedFiles=no`) | `git ls-files --others` cek; `git add` sebelum build |
| Duplikasi kebenaran teknis vs kode | Docs mereferensikan kontrak (`docs/contracts`), bukan menyalin logika |

---

## 8. File Referensi
| File | Topik |
|---|---|
| `services/sso-docs/.vitepress/config.ts` | i18n, nav, sidebar |
| `services/sso-docs/sync-content.sh` | sinkronisasi & rewrite link |
| `services/sso-docs/nginx.conf` | penyajian (acuan standar) |
| `services/sso-docs/Dockerfile` | image produksi |
| `docs/developers/**`, `docs/onboarding/**` | sumber konten |
| `docs/design/sso-docs-code-quality-standard.md` | standar mutu konten/kode |

---

_TDD dibuat 2026-06-15. Inti: situs dokumentasi statis VitePress (i18n id+en) yang **mereferensikan**, bukan menggandakan, kebenaran teknis; konten disinkronkan dari `docs/**` via `sync-content.sh`; build menegakkan dead-link gate; nginx menyajikan dengan gzip + immutable cache (jadi acuan standar penyajian). Lihat standar mutu pendamping & TDD backend di `docs/design/`._
