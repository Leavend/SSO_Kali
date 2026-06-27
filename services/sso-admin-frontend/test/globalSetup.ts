/**
 * Vitest globalSetup — builds the Nuxt app via subprocess before the e2e SSR
 * smoke tests run. This is the **e2e-only** workaround; the in-process
 * component path (mountSuspended, test/*.nuxt.spec.ts) needs NO pre-build.
 *
 * Why a subprocess for the e2e path (after vite was aligned to a single 7.x):
 *   @nuxt/test-utils/e2e `setup({ build: true })` runs the FULL Nuxt vite build
 *   (loadNuxt → buildNuxt → @vitejs/plugin-vue → @vue/compiler-sfc + esbuild)
 *   INSIDE the vitest worker. That worker is configured by @nuxt/test-utils for
 *   browser/DOM component testing, and two worker-level constraints break the
 *   in-process full build — neither is a vite-version issue:
 *     1. @nuxt/test-utils sets browser-first `resolve.conditions`
 *        (['web','import','module','default'], no 'require'), so the inlined
 *        @vue/compiler-sfc.cjs.js's `require('magic-string')` resolves to the
 *        ESM namespace → "MagicString is not a constructor".
 *     2. Under the jsdom environment (the default project), jsdom replaces the
 *        global TextEncoder/Uint8Array, which trips esbuild's startup invariant
 *        ("new TextEncoder().encode('') instanceof Uint8Array" is false). The
 *        e2e spec cannot opt into the `node` environment because the auto-split
 *        projects created by defineVitestConfig ignore the per-file
 *        `// @vitest-environment` pragma, and a `node` default would break the
 *        jsdom `mount` component specs that later tasks add.
 *   A subprocess `nuxt build` gets a clean Node module cache and real Node
 *   globals, so neither constraint applies. The spec then runs with
 *   `setup({ build: false, server: true })` against the pre-built .output.
 *
 * The component path avoids all of this: mountSuspended compiles SFCs through
 * the Nuxt vitest environment's vite-node SSR transform (ESM @vue/compiler-sfc,
 * no `require('magic-string')`, no esbuild optimizeDeps), so it builds and
 * mounts in-process. See test/component-smoke.nuxt.spec.ts.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '../..')

// defineVitestConfig auto-splits into a 'nuxt' and a default project, and vitest
// copies this root globalSetup into each (it runs once per project, in a fresh
// module instance — so an in-memory flag would not dedupe). The builds run
// sequentially in the same run, so a single atomic lock dir lets the first
// invocation build and the rest skip; the owner removes the lock on teardown so
// the next `npm run test` rebuilds fresh (no staleness).
const lockDir = resolve(rootDir, 'node_modules', '.cache', 'sso-admin-e2e-build')

export async function setup() {
  mkdirSync(resolve(rootDir, 'node_modules', '.cache'), { recursive: true })
  let owner = false
  try {
    mkdirSync(lockDir) // atomic create; throws EEXIST if another invocation owns it
    owner = true
  } catch {
    owner = false
  }
  if (owner) {
    console.log('\n[globalSetup] Building Nuxt app for e2e SSR smoke tests...')
    execSync('node node_modules/.bin/nuxt build', {
      cwd: rootDir,
      stdio: 'inherit',
    })
    console.log('[globalSetup] Build complete.\n')

    // Pre-build the §3.3 SSR token-leak render-gate fixture LAYER (Task 2c.1).
    // It extends the real app and adds an authenticated sentinel session + a
    // private runtimeConfig canary. Like the main app, its full vite build cannot
    // run in-process under the vitest worker (MagicString / TextEncoder — see the
    // module header), so it is built here in a subprocess and the gate runs
    // setup({ build: false }) against test/fixtures/ssr-leak/.output.
    console.log('[globalSetup] Building SSR token-leak fixture layer...')
    execSync('node node_modules/.bin/nuxt build test/fixtures/ssr-leak', {
      cwd: rootDir,
      stdio: 'inherit',
    })
    console.log('[globalSetup] Fixture build complete.\n')
  }
  return () => {
    if (owner) rmSync(lockDir, { recursive: true, force: true })
  }
}
