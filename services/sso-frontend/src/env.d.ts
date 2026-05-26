/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_FRONTEND_BASE_PATH?: string
  readonly VITE_PUBLIC_ADMIN_FRONTEND_BASE_PATH?: string
}

declare module '*.css'
