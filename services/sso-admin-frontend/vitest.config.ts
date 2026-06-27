import { defineVitestConfig } from '@nuxt/test-utils/config'

// Only Nuxt-era tests run during the migration. The legacy src/ Vitest suite
// keeps running under the old toolchain and is re-tested per-domain as each
// page is ported in later phases.
export default defineVitestConfig({
  test: {
    // globalSetup builds the Nuxt app via subprocess before SSR e2e tests
    // run. This avoids the in-process vite 7/8 conflict described in
    // test/globalSetup.ts. When no SSR e2e specs exist the build is still
    // triggered; that overhead is acceptable during Phase 0 and is removed
    // once the migration is complete and the old build pipeline is retired.
    globalSetup: ['./test/globalSetup.ts'],

    // Default DOM environment so @vue/test-utils `mount` component specs (2a.7,
    // 2a.8, all of 2b.3–2b.9) have `document`/`window`. Specs that need the Nuxt
    // runtime (mountSuspended/renderSuspended) opt in per-file with the first-line
    // pragma `// @vitest-environment nuxt`; e2e specs (@nuxt/test-utils/e2e
    // setup + $fetch, e.g. the SSR smoke + leak gate) spawn a real server and are
    // unaffected by the default DOM env.
    environment: 'jsdom',
    include: ['test/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.nuxt', '.output', 'e2e', 'src'],
  },
})
