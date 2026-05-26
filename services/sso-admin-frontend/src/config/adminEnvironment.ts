export interface AdminEnvironment {
  readonly adminBaseUrl: string
  readonly publicBasePath: string
  readonly ssoBaseUrl: string
  readonly zitadelIssuerUrl: string
}

export function getAdminEnvironment(): AdminEnvironment {
  return {
    adminBaseUrl: readEnv('VITE_ADMIN_BASE_URL', 'https://dev-sso.timeh.my.id'),
    publicBasePath: readEnv('VITE_PUBLIC_BASE_PATH', '/__vue-preview'),
    ssoBaseUrl: readEnv('VITE_SSO_BASE_URL', 'https://dev-sso.timeh.my.id'),
    zitadelIssuerUrl: readEnv('VITE_ZITADEL_ISSUER_URL', 'https://id.dev-sso.timeh.my.id'),
  }
}

function readEnv(key: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[key]
  return value && value.trim() !== '' ? value : fallback
}
