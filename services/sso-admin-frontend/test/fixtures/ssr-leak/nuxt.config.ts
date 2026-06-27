import { fileURLToPath } from 'node:url'
import { SSR_LEAK_CANARY } from './sentinels'

// SSR token-leak render-gate fixture. Extends the real admin app as a Nuxt LAYER
// so the gate renders the REAL pages / components / server routes (representative),
// then layers on (a) an authenticated sentinel session via server middleware and
// (b) a private runtimeConfig canary that must never reach the client.
export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  runtimeConfig: {
    // PRIVATE (server-only) canary — never serialized into SSR HTML / the payload.
    sessionEncryptionSecret: SSR_LEAK_CANARY,
    public: {
      adminAppBaseUrl: 'http://admin.test',
      basePath: '/__vue-preview',
    },
  },
})
