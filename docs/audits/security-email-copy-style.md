# Dev-SSO Security Email Style

- Bahasa default: Bahasa Indonesia; setiap notification menerima parameter locale opsional.
- Sapaan: `Halo, {display_name}` dengan fallback `Halo,`.
- Subject menjelaskan kejadian dan tingkat urgensi tanpa istilah internal.
- Isi memakai kalimat aktif, satu CTA utama, waktu manusiawi dalam zona `sso.display_timezone`, dan instruksi aman bila aktivitas tidak dikenali.
- Password, OTP, recovery code, token, serta detail internal tidak pernah diminta melalui balasan email.
- Tanda tangan standar: `Tim Keamanan Dev-SSO`.
- Branding berasal dari Laravel Markdown theme `devsso`; nama framework tidak ditampilkan kepada penerima.
