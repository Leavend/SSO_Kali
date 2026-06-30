import { fileURLToPath } from 'node:url'

// e2e Nuxt LAYER: extends the real admin app and overrides /api/admin/* with
// in-process mock handlers so Playwright drives REAL SSR with no backend/redis.
// More-specific server routes here win over the app's /api/admin/[...] proxy
// (the same precedence the §3.3 ssr-leak layer relies on).
export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  runtimeConfig: {
    public: {
      adminAppBaseUrl: 'http://127.0.0.1:3000',
      basePath: '/',
    },
  },
})
