import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { injectI18nShell } from './vite/inject-i18n-shell.js'

const localesDir = fileURLToPath(new URL('./src/locales', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // ISS-PERF2: inline the i18n shell into index.html so first paint has
    // brand/nav/splash/login labels without any JS download.
    injectI18nShell({ localesDir }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@parent-ui': fileURLToPath(new URL('../../packages/dev-sso-parent-ui', import.meta.url)),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    exclude: ['tailwind-merge'],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    cssCodeSplit: true,
    // ISS-PERF6: split heavy deps out of the entry chunk so the initial
    // bundle stays small. The named chunks are lazy-loaded on demand by
    // the OIDC callback, MFA setup, etc.
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/jose/')) return 'vendor-jose'
          if (id.includes('node_modules/qrcode-generator/')) return 'vendor-qrcode'
          if (id.includes('node_modules/oidc-client-ts/')) return 'vendor-oidc'
          return undefined
        },
      },
      onwarn(warning, defaultHandler) {
        if (
          warning.code === 'INVALID_ANNOTATION' &&
          warning.message.includes('node_modules/@vueuse/core/dist/index.js')
        ) {
          return
        }

        defaultHandler(warning)
      },
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    watch: {
      ignored: [
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/test-results/**',
        '**/node_modules/**',
        '**/* 2.*',
        '**/* 3.*',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000',
      '/healthz': 'http://127.0.0.1:3000',
    },
  },
})
