// @vitest-environment node
/**
 * SSR smoke + token-leak gate — Phase 0 harness validation.
 *
 * Two deviations from the brief's literal snippet, both caused by genuine
 * @nuxt/test-utils 4.x API differences (documented as DONE_WITH_CONCERNS):
 *
 * 1. `setup()` is called directly inside the async `describe` callback, NOT
 *    inside a `beforeAll`.  In v4.x, `setup()` itself registers an internal
 *    `beforeAll` via setupVitest().  Wrapping it in another `beforeAll` causes
 *    nested hook registration that never fires before the test cases, leaving
 *    `$fetch` without a URL context.  The async-describe pattern is the
 *    documented v4.x idiom and is semantically identical.
 *
 * 2. `build: false` is used instead of `build: true` (the default), and the
 *    canary is injected as `env.NUXT_SESSION_ENCRYPTION_SECRET` rather than
 *    via `nuxtConfig.runtimeConfig`.  The in-process `buildNuxt()` path fails
 *    in this project due to a vite 7 / vite 8 module-resolution conflict
 *    (see test/globalSetup.ts for the full explanation).  The pre-built server
 *    started via `node .output/server/index.mjs` reads the env var at startup
 *    and maps it to `runtimeConfig.sessionEncryptionSecret` — the private-
 *    config leak gate semantics are identical.
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '../..')

describe('Phase 0 SSR scaffold', async () => {
  // Pre-built server started by globalSetup (see test/globalSetup.ts).
  // The NUXT_SESSION_ENCRYPTION_SECRET env var maps to the private half of
  // runtimeConfig at Nuxt runtime — it must never reach the SSR HTML /
  // __NUXT__ payload.  This is the seed of the leak gate.
  await setup({
    server: true,
    build: false,
    browser: false,
    nuxtConfig: {
      // Point at the pre-built output produced by globalSetup.
      nitro: { output: { dir: resolve(rootDir, '.output') } },
    },
    env: {
      NUXT_SESSION_ENCRYPTION_SECRET: 'leak-canary-do-not-render',
      NUXT_PUBLIC_ADMIN_APP_BASE_URL: 'http://admin.test',
    },
  })

  it('server-renders the empty admin shell', async () => {
    const html = await $fetch('/')
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('Admin console')
  })

  it('does not leak server-only runtimeConfig into the SSR payload', async () => {
    const html = await $fetch('/')
    expect(html).not.toContain('leak-canary-do-not-render')
    expect(html).not.toContain('sessionEncryptionSecret')
    expect(html).not.toContain('adminOidcClientSecret')
  })
})
