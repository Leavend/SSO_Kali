# Frontend Broker Boundary Lint

## Guardrail

`tools/frontend-security/check-broker-boundary.mjs` enforces that frontend code stays broker-integrated.

## Scanned surfaces

- `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- `.env` / `.env.example`
- `package.json`
- `eslint.config.*`
- `next.config.*`

## Violations

The scan fails if it detects:
- direct `zitadel` or `id.dev-sso...` hosts
- `/oauth/v2/authorize`
- `/oauth/v2/token`
- `/oauth/v2/keys`
- `/oidc/v1/userinfo`
- `/oidc/v1/end_session`
- `/oauth/v2/revoke`
- `/.well-known/openid-configuration`
- `ZITADEL_*` env/config bindings

## CI usage

- App A: `npm run lint`
- Admin Panel: `npm run lint`

Both commands run ESLint first and then the broker-boundary scan.
