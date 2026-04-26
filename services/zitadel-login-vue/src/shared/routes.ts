export const DEFAULT_BASE_PATH = '/ui/v2/login-vue'

const FLOW_ID_PATTERN = /^[A-Za-z0-9._~-]{1,200}$/

export function normalizeBasePath(value?: string): string {
  const raw = value?.trim() || DEFAULT_BASE_PATH
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`
  return prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed
}

export function withBasePath(basePath: string, path: string): string {
  const normalizedBase = normalizeBasePath(basePath)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

export function stripBasePath(basePath: string, pathname: string): string | null {
  const normalizedBase = normalizeBasePath(basePath)
  if (pathname === normalizedBase) return '/'
  if (!pathname.startsWith(`${normalizedBase}/`)) return null
  return pathname.slice(normalizedBase.length) || '/'
}

export function sanitizeFlowId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return FLOW_ID_PATTERN.test(trimmed) ? trimmed : null
}

export function sanitizeLoginName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 254)
}

export function sanitizeOtpCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\D/g, '').slice(0, 8)
}

export function isInternalRedirect(value: unknown, basePath: string): value is string {
  return typeof value === 'string' && value.startsWith(`${normalizeBasePath(basePath)}/`)
}
