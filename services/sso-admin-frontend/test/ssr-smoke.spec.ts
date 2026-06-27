/**
 * SSR smoke + token-leak gate — Phase 0 harness validation.
 *
 * Canonical pattern (a): e2e SSR test.
 *
 * `setup()` is called directly inside the async `describe` callback, NOT inside
 * a `beforeAll`. In @nuxt/test-utils 4.x, `setup()` itself registers an
 * internal `beforeAll` (via setupVitest()). Wrapping it in another `beforeAll`
 * nests the hook so it fires after the test cases, leaving `$fetch` without a
 * URL context. The async-describe form is the documented v4.x idiom.
 *
 * `build: false` + a pre-built server: the e2e in-process full build is blocked
 * at the vitest-worker level (browser-first resolve.conditions → MagicString,
 * and jsdom globals → esbuild TextEncoder invariant). test/globalSetup.ts
 * pre-builds via a subprocess and this spec runs the pre-built
 * .output/server/index.mjs. The full root-cause analysis lives in
 * test/globalSetup.ts. (The in-process component path needs no such workaround
 * — see test/component-smoke.nuxt.spec.ts.)
 *
 * The leak canary is injected as the server env var NUXT_SESSION_ENCRYPTION_SECRET
 * (the spawned server maps it to runtimeConfig.sessionEncryptionSecret at
 * startup) rather than via nuxtConfig.runtimeConfig, which would only affect an
 * in-process build. The leak-gate semantics are identical: private config must
 * never reach the SSR HTML / __NUXT__ payload.
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '../..')

// The async describe callback is required by @nuxt/test-utils v4 (see header):
// setup() must register its own beforeAll during collection. This is the only
// place the otherwise-correct valid-describe-callback rule is suppressed.
// eslint-disable-next-line vitest/valid-describe-callback
describe('Phase 0 SSR scaffold', async () => {
  await setup({
    server: true,
    build: false,
    browser: false,
    nuxtConfig: {
      // Point at the pre-built output produced by test/globalSetup.ts.
      nitro: { output: { dir: resolve(rootDir, '.output') } },
    },
    env: {
      NUXT_SESSION_ENCRYPTION_SECRET: 'leak-canary-do-not-render',
      NUXT_PUBLIC_ADMIN_APP_BASE_URL: 'http://admin.test',
    },
  })

  it('server-renders an unguarded redirect-target page', async () => {
    // /forbidden is layout: false (no admin shell) and no requiresAdmin, so the
    // guard passes without session bootstrap and Nitro renders the page directly.
    const html = await $fetch('/forbidden')
    expect(html).toContain('Access denied')
  })

  it('does not leak server-only runtimeConfig into the SSR payload', async () => {
    const html = await $fetch('/forbidden')
    expect(html).not.toContain('leak-canary-do-not-render')
    expect(html).not.toContain('sessionEncryptionSecret')
    expect(html).not.toContain('adminOidcClientSecret')
  })
})
