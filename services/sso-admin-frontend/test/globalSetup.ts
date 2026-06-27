/**
 * Vitest globalSetup — builds the Nuxt app via subprocess before the SSR
 * smoke tests run.
 *
 * Why subprocess instead of in-process buildNuxt():
 *   @nuxt/vite-builder uses vite 7.x internally while our project depends on
 *   vite 8.x. When both are loaded in the same Node.js process (as happens
 *   when @nuxt/test-utils/e2e's setup() calls buildNuxt() in-process), the
 *   browser-first resolve.conditions set by @nuxt/test-utils/config cause
 *   `require('magic-string')` inside @vue/compiler-sfc.cjs.js to resolve to
 *   the ESM namespace object instead of the CJS constructor, resulting in
 *   "MagicString is not a constructor".  A subprocess gets a fresh Node.js
 *   module cache and its own resolve context, so the conflict never arises.
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '../..')

export async function setup() {
  console.log('\n[globalSetup] Building Nuxt app for SSR smoke tests...')
  execSync('node node_modules/.bin/nuxt build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('[globalSetup] Build complete.\n')
}
