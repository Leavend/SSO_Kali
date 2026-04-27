import { AUTH_ROUTES, identityActionHref } from '@parent-ui/auth-shell.mjs'
import { normalizeBasePath, withBasePath } from '@shared/routes'

const basePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH)

export function passwordResetHref(loginName: string): string {
  return identityActionHref(withBasePath(basePath, AUTH_ROUTES.identityVue.passwordReset), loginName)
}

export function registerHref(loginName: string): string {
  return identityActionHref(withBasePath(basePath, AUTH_ROUTES.identityVue.register), loginName)
}
