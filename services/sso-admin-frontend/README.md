# Dev-SSO Admin Frontend

Dedicated Admin SSO frontend dengan Node BFF token-broker. Browser tetap hanya
memegang cookie opaque httpOnly; access token disimpan server-side dan hanya
di-inject oleh BFF saat proxy ke backend admin API.

## Guardrails

- Jangan pindahkan token exchange atau access token ke browser.
- `/auth/*` berjalan di BFF admin dengan OIDC Authorization Code + PKCE.
- `/api/admin/*` wajib lewat BFF admin; BFF inject `Authorization: Bearer`.
- Cookie sesi BFF memakai `__Host-sso-admin-session`, host-only, httpOnly.

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
