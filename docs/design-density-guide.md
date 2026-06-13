# Panduan Skala Kepadatan & Tipografi (Anti-Drift Guardrail)

Dokumen ini mendefinisikan aturan dan token desain global untuk menjaga konsistensi visual di seluruh SSO Admin dan Portal SSO guna mencegah "zoom-in visual effect".

## 1. Skala Tipografi Global
Aturan ukuran font wajib menggunakan CSS variables berikut (didefinisikan di `@theme inline` pada `main.css` admin):

| CSS Variable | Font Size (rem) | Equivalent (px) | Kegunaan Utama |
|---|---|---|---|
| `--text-2xs` | `0.6875rem` | 11px | Label sangat kecil, metadata sekunder |
| `--text-xs` | `0.75rem` | 12px | Badge, caption, tooltip, bantuan |
| `--text-sm` | `0.8125rem` | 13px | **Default Body Text**, label input, deskripsi form |
| `--text-base` | `0.875rem` | 14px | Judul kartu kecil, teks menu samping |
| `--text-lg` | `1rem` | 16px | Sub-judul halaman, tombol utama |
| `--text-xl` | `1.125rem` | 18px | Sub-header, status panel |
| `--text-2xl` | `1.375rem` | 22px | **Default Title**, heading halaman utama |

## 2. Batasan Lebar Kontainer (Max-Width constraints)
Untuk mencegah peregangan halaman yang terlalu lebar pada layar desktop ultra-wide:
* **Formulir Tunggal / Halaman Pembuatan**: Gunakan batas `max-w-3xl` (`--container-form: 48rem`).
* **Halaman Dashboard / List Master-Detail**: Gunakan batas `max-w-7xl` (`--container-page: 80rem`) dipadukan dengan `mx-auto px-4 md:px-6`.

## 3. Responsive Hardening
* **Penyusunan Flex/Grid**: Biasakan gunakan layout responsif seperti `grid-cols-1 md:grid-cols-3` atau kolom ganda pada desktop (`md:grid-cols-2`).
* **Touch Targets**: Pastikan ukuran minimal elemen interaktif (tombol, tautan, switch) adalah `44px` atau `min-h-[38px]` dengan padding vertikal agar ramah layar sentuh mobile.
