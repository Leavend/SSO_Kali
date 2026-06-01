# Dev-SSO Admin Frontend

Dedicated Admin SSO frontend dengan Node BFF token-broker. Browser tetap hanya
memegang cookie opaque httpOnly; access token disimpan server-side dan hanya
di-inject oleh BFF saat proxy ke backend admin API.

## Guardrails

- Jangan pindahkan token exchange atau access token ke browser.
- `/auth/*` berjalan di BFF admin dengan OIDC Authorization Code + PKCE.
- `/api/admin/*` wajib lewat BFF admin; BFF inject `Authorization: Bearer`.
- Cookie sesi BFF memakai `__Host-sso-admin-session`, host-only, httpOnly.

## Admin API Auth Contract

Backend admin API (`/admin/api/*`) adalah resource-server bearer-only. Middleware
`AdminGuard` membaca `Authorization: Bearer <access_token>` dan tidak membaca
cookie portal. Browser admin SPA tetap memanggil path same-origin `/api/admin/*`
dengan `credentials: 'include'`; hanya BFF admin yang boleh membaca sesi
server-side dan meng-inject Bearer ke backend.

Jangan mencoba membagikan cookie portal `__Host-sso_session` atau
`__Host-laravel_session` ke `admin-sso.timeh.my.id`. Cookie `__Host-` harus
host-only, `Secure`, `Path=/`, tanpa atribut `Domain`; mengubahnya menjadi
`Domain=.timeh.my.id` akan melemahkan isolasi subdomain dan tetap bukan kontrak
admin API. Solusi benar untuk admin standalone adalah token broker BFF dengan
cookie opaque `__Host-sso-admin-session` yang scoped ke host admin.

## Project Setup

```bash
npm install
```

## Local Development

```bash
npm run dev
```

## Quality Gates

```bash
npm run type-check
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

## Runtime

Production image build/deploy dilakukan lewat GitHub workflows. Jangan jalankan
local Docker build untuk service ini.
