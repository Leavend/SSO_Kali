/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_BASE_URL?: string
  readonly VITE_PUBLIC_BASE_PATH?: string
  readonly VITE_SSO_BASE_URL?: string
  readonly VITE_ZITADEL_ISSUER_URL?: string
}
