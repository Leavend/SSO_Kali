# ZITADEL Vue Login Canary

This service is the safe Vue-based replacement path for ZITADEL Hosted Login V2.
It does not patch the upstream Next.js bundle at runtime. Instead, it runs a
Vue 3/Vite UI with a small Node BFF that talks to ZITADEL Session and OIDC APIs
using the service account token already created for the hosted login client.
The official `@zitadel/vue` example is a Vue SPA OIDC client pattern; this
login canary follows ZITADEL's custom Login UI API flow instead so credentials
and session tokens are never stored in browser-accessible storage.

Default route:

```text
/ui/v2/auth
```

Cutover is controlled by the ZITADEL login URL/base URI configuration. Rollback
returns the active login base path to `/ui/v2/login`.
