import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_PUBLIC_BASE_PATH || '/ui/v2/auth/'

  return {
    base: base.endsWith('/') ? base : `${base}/`,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/web', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@parent-ui': fileURLToPath(new URL('../../packages/dev-sso-parent-ui', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/ui/v2/auth/api': 'http://127.0.0.1:3010',
        '/ui/v2/auth/healthz': 'http://127.0.0.1:3010',
      },
    },
  }
})
