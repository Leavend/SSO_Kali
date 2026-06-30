import { defineEventHandler, setResponseHeader } from 'h3'

// Liveness probe — restores parity with the legacy Node server (src/server/
// index.ts served GET /healthz → 200 'ok'). Nitro server routes take precedence
// over the Vue catch-all, so this answers 200 with no auth/SSR. Consumed by the
// compose healthchecks, the deploy-main smoke, and scripts/vps-deploy-main.sh.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return 'ok\n'
})
