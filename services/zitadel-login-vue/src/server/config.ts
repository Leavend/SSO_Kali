import { readFile } from 'node:fs/promises'

import { normalizeBasePath } from '../shared/routes.js'

export interface RuntimeConfig {
  readonly port: number
  readonly publicBasePath: string
  readonly apiUrl: string
  readonly publicHost: string
  readonly appBaseUrl: string
  readonly instanceHost: string
  readonly cookieSecret: string
  readonly secureCookies: boolean
  readonly requireTotpAfterPassword: boolean
  readonly apiTimeoutMs: number
  readonly token?: string
  readonly tokenFile?: string
}

let cachedConfig: RuntimeConfig | null = null
let cachedToken: string | null = null

export function getConfig(): RuntimeConfig {
  cachedConfig ??= loadConfig()
  return cachedConfig
}

export async function getServiceToken(config = getConfig()): Promise<string> {
  if (config.token) return config.token
  if (cachedToken) return cachedToken
  if (!config.tokenFile) throw new Error('missing_service_token')
  cachedToken = (await readFile(config.tokenFile, 'utf8')).trim()
  return cachedToken
}

function loadConfig(): RuntimeConfig {
  const publicHost = env('ZITADEL_PUBLIC_HOST', env('ZITADEL_DOMAIN', 'id.dev-sso.timeh.my.id'))
  return {
    port: Number.parseInt(env('PORT', '3010'), 10),
    publicBasePath: normalizeBasePath(env('PUBLIC_BASE_PATH', undefined)),
    apiUrl: trimTrailingSlash(env('ZITADEL_API_URL', 'http://zitadel-api:8080')),
    publicHost,
    appBaseUrl: trimTrailingSlash(env('DEV_SSO_APP_BASE_URL', 'https://dev-sso.timeh.my.id')),
    instanceHost: env('ZITADEL_INSTANCE_HOST', publicHost),
    cookieSecret: requireSecret(env('LOGIN_COOKIE_SECRET', '')),
    secureCookies: env('SECURE_COOKIES', 'true') !== 'false',
    requireTotpAfterPassword: env('LOGIN_REQUIRE_TOTP_AFTER_PASSWORD', 'true') !== 'false',
    apiTimeoutMs: positiveInteger(env('ZITADEL_API_TIMEOUT_MS', '6000'), 6000),
    token: process.env.ZITADEL_SERVICE_USER_TOKEN,
    tokenFile: process.env.ZITADEL_SERVICE_USER_TOKEN_FILE,
  }
}

function env(key: string, fallback: string | undefined): string {
  return process.env[key]?.trim() || fallback || ''
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function requireSecret(value: string): string {
  if (value.length >= 32) return value
  if (process.env.NODE_ENV === 'production') throw new Error('LOGIN_COOKIE_SECRET must be at least 32 chars')
  return 'dev-only-zitadel-login-vue-cookie-secret'
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
