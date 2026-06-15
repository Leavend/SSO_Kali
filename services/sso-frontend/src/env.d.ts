/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_ADMIN_FRONTEND_BASE_PATH?: string
  readonly VITE_PUBLIC_ADMIN_FRONTEND_BASE_PATH?: string
  readonly VITE_ADMIN_FRONTEND_ORIGIN?: string
}

declare module '*.css'
