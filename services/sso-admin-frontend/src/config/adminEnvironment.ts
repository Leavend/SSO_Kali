export interface AdminEnvironment {
  readonly adminBaseUrl: string
  readonly publicBasePath: string
  readonly ssoBaseUrl: string
  readonly zitadelIssuerUrl: string
  readonly docsBaseUrl: string
  readonly VITE_ADMIN_DASHBOARD_POLL_MS: string
  readonly VITE_ADMIN_USERS_POLL_MS: string
}

export function getAdminEnvironment(): AdminEnvironment {
  return {
    adminBaseUrl: readEnv('VITE_ADMIN_BASE_URL', 'https://dev-sso.timeh.my.id'),
    publicBasePath: readEnv('VITE_PUBLIC_BASE_PATH', '/__vue-preview'),
    ssoBaseUrl: readEnv('VITE_SSO_BASE_URL', 'https://dev-sso.timeh.my.id'),
    zitadelIssuerUrl: readEnv('VITE_ZITADEL_ISSUER_URL', 'https://id.dev-sso.timeh.my.id'),
    docsBaseUrl: readEnv('VITE_DOCS_BASE_URL', 'https://docs.sso.timeh.my.id'),
    VITE_ADMIN_DASHBOARD_POLL_MS: readEnv('VITE_ADMIN_DASHBOARD_POLL_MS', '30000'),
    VITE_ADMIN_USERS_POLL_MS: readEnv('VITE_ADMIN_USERS_POLL_MS', '45000'),
  }
}

function readEnv(key: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[key]
  return value && value.trim() !== '' ? value : fallback
}
