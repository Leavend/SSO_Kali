/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SSO_API_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_OIDC_ISSUER?: string
  readonly VITE_OIDC_CLIENT_ID?: string
  readonly VITE_OIDC_SCOPE?: string
  readonly VITE_OIDC_REDIRECT_URI?: string
  readonly VITE_OIDC_AUTHORIZE_ENDPOINT?: string
  readonly VITE_OIDC_TOKEN_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
