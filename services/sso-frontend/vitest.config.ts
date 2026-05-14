import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@parent-ui': fileURLToPath(new URL('../../packages/dev-sso-parent-ui', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'vmThreads',
    exclude: [
      '.next/**',
      '.codex-temp/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'e2e/**',
    ],
    globals: true,
  },
})
