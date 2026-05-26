# Dev-SSO Admin Frontend

Parallel admin frontend untuk migrasi bertahap dari `services/sso-frontend`
tanpa mengganggu trafik production.

## Guardrails

- Service ini berjalan sebagai canary di path `/__vue-preview`.
- Jangan pindahkan token exchange ke browser.
- Callback, refresh token, dan session cookie tetap server-side sampai BFF
  Laravel siap.
- Next.js admin lama tetap menjadi fallback rollback sampai cutover resmi.

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
```

## Docker Preview

```bash
docker build -t sso-admin-frontend:local .
docker run --rm -p 4173:8080 sso-admin-frontend:local
```
