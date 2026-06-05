import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mockApi = env.VITE_MOCK_API !== 'false'
  const adminUrl = env.VITE_SSO_ADMIN_URL || 'https://admin-sso.timeh.my.id'

  const proxyConfig = !mockApi
    ? {
        server: {
          proxy: {
            '/api/admin': {
              target: adminUrl,
              changeOrigin: true,
              secure: true,
              configure: (proxy: any) => {
                proxy.on('proxyReq', (proxyReq: any) => {
                  const devCookie = env.VITE_DEV_SESSION_COOKIE
                  if (devCookie) {
                    proxyReq.setHeader('Cookie', `__Host-sso-admin-session=${devCookie}`)
                  }
                })
              },
            },
          },
        },
      }
    : {}

  return {
    base: normalizeBasePath(env.VITE_PUBLIC_BASE_PATH),
    build: {
      outDir: 'dist/client',
    },
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    ...proxyConfig,
  }
})

function normalizeBasePath(path: string | undefined): string {
  if (!path || path === '/') return '/'

  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}
