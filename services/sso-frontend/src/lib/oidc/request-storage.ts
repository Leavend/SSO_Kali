/**
 * OIDC authorize request storage — menyimpan PKCE verifier, state,
 * nonce, redirect, dll. sementara menunggu callback.
 *
 * Sengaja pakai `sessionStorage` (bukan `localStorage`) supaya scope
 * hanya di tab aktif dan hilang saat tab ditutup.
 */

export type AuthorizeRequestSnapshot = {
  readonly client_id: string
  readonly redirect_uri: string
  readonly state: string
  readonly nonce: string
  readonly code_verifier: string
  readonly scope: string
  readonly post_login_redirect: string
  readonly issuer: string
  readonly issued_at: number
}

const STORAGE_KEY = 'dev-sso.oidc.authorize_request'

export function saveAuthorizeRequest(snapshot: AuthorizeRequestSnapshot): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

export function takeAuthorizeRequest(): AuthorizeRequestSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  sessionStorage.removeItem(STORAGE_KEY)
  try {
    return JSON.parse(raw) as AuthorizeRequestSnapshot
  } catch {
    return null
  }
}

export function clearAuthorizeRequest(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}
