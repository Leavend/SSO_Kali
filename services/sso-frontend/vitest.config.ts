import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const sourceAlias = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': sourceAlias('./src'),
      '@shared': sourceAlias('./src/shared'),
      '@parent-ui': sourceAlias('../../packages/dev-sso-parent-ui'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
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
      'src/components/molecules/__tests__/SessionCard.spec.ts',
      'src/components/organisms/__tests__/PortalHeader.spec.ts',
      'src/layouts/__tests__/PortalLayout.spec.ts',
      'src/pages/portal/__tests__/ConnectedAppsPage.spec.ts',
      'src/pages/portal/__tests__/SecurityPage.spec.ts',
      'src/pages/portal/__tests__/SessionsPage.spec.ts',
    ],
    globals: true,
  },
})
