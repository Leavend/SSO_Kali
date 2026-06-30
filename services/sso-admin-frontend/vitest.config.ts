import { defineVitestConfig } from '@nuxt/test-utils/config'
import type { Plugin } from 'vite'

// @nuxt/test-utils' shared setup module statically lists dynamic imports for
// every supported test runner (bun:test, @jest/globals, @cucumber/cucumber)
// even though only one runner (vitest) is ever used. With vite 7, import-
// analysis crawls those dynamic imports and fails ("Cannot bundle built-in
// module 'bun:test'") because the foreign runners are not installed. (vite 8
// externalised them implicitly; vite 7 does not.) Mark them external so the
// import statements survive untouched — they are never evaluated under vitest.
const foreignTestRunners = new Set(['bun:test', '@jest/globals', '@cucumber/cucumber'])
const externalizeForeignTestRunners: Plugin = {
  name: 'sso-admin:externalize-foreign-test-runners',
  enforce: 'pre',
  resolveId(id) {
    if (foreignTestRunners.has(id)) {
      return { id, external: true }
    }
  },
}

// Nuxt-era test harness. Only Nuxt-era tests run during the migration; the
// legacy src/ Vitest suite is re-tested per-domain as each page is ported in
// later phases (excluded below).
//
// ── Single-vite toolchain ────────────────────────────────────────────────
// vite is pinned to ^7.3.3 in package.json to match nuxt@4.4.8's declared dep
// (@nuxt/vite-builder resolves vite 7.x). A previous vite@8 top-level pin made
// TWO vite majors coexist and broke the IN-PROCESS Nuxt build with
// "MagicString is not a constructor". Aligning to a single vite 7 fixes the
// component build path: mountSuspended now builds + mounts real components
// in-process (the path Task 2a.0 and every 2b component spec depend on).
//
// The e2e path (@nuxt/test-utils/e2e setup() running a FULL `buildNuxt`) still
// cannot build in-process — but for reasons that are NOT the vite version and
// are not fixable here (see test/globalSetup.ts): the vitest worker's
// browser-first resolve.conditions force @vue/compiler-sfc.cjs's
// require('magic-string') to the ESM namespace, and jsdom's globals trip
// esbuild's TextEncoder invariant; the e2e spec cannot opt into a `node` env
// because the auto-split projects below ignore the per-file
// `// @vitest-environment` pragma. So the e2e SSR smoke pre-builds via a
// subprocess (globalSetup) and runs setup({ build: false }) against .output.
//
// ── Canonical test patterns (the 3 the remaining tasks follow) ───────────
// defineVitestConfig (v4.x) auto-splits into TWO vitest projects whenever the
// default `environment` is not 'nuxt'. Environment routing is therefore by
// FILENAME, not by the `// @vitest-environment` pragma (the pragma is
// overridden by the project's environment):
//
//   (a) e2e SSR test  → plain *.spec.ts (NOT *.nuxt.spec.ts). Runs in the
//       default project below. Pattern: call `setup()` from
//       '@nuxt/test-utils/e2e' directly in the async `describe` body (NOT in
//       beforeAll — v4's setup() registers its own beforeAll, so wrapping it
//       nests the hook and it fires after the tests), with `build: false`
//       against the globalSetup-built .output, then assert over `$fetch('/')`.
//       Example: test/ssr-smoke.spec.ts.
//
//   (b) in-process component test → name the file *.nuxt.spec.ts (or put it
//       under test/nuxt/). defineVitestConfig routes these to the auto-created
//       'nuxt' project (environment: 'nuxt'). Use `mountSuspended` /
//       `renderSuspended` from '@nuxt/test-utils/runtime'. Builds in-process,
//       no pre-build needed. This is the path 2a.0 + every 2b component spec
//       depend on. Example: test/component-smoke.nuxt.spec.ts.
//
//   (c) pure unit test (server utils, pure fns) → plain *.spec.ts. Runs in the
//       default project under jsdom (DOM available for @vue/test-utils `mount`
//       component specs too).
export default defineVitestConfig({
  plugins: [externalizeForeignTestRunners],
  test: {
    // Subprocess Nuxt build for the e2e SSR smoke only (root cause documented
    // in test/globalSetup.ts). The component/mountSuspended path does NOT use
    // this — it builds in-process under the 'nuxt' environment project.
    globalSetup: ['./test/globalSetup.ts'],
    // Default DOM environment for the non-nuxt project so @vue/test-utils
    // `mount` component specs have document/window. Files named *.nuxt.spec.ts
    // (or under test/nuxt/) are auto-routed to the 'nuxt' environment project
    // for mountSuspended/renderSuspended; e2e specs spawn a real server via
    // setup()+$fetch and are unaffected by the DOM env.
    environment: 'jsdom',
    // The auto-created 'nuxt' environment project defaults its internal DOM to
    // happy-dom; pin it to jsdom (already a devDependency) so we keep a single
    // DOM implementation across both projects.
    environmentOptions: { nuxt: { domEnvironment: 'jsdom' } },
    include: ['test/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts', 'server/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.nuxt', '.output', 'e2e', 'src'],
  },
})
