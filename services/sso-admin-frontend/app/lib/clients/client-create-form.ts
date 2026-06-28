// Single source of truth for client URI + create-form validation. The legacy
// SPA shipped TWO divergent URI validators — the strict create-form rules and
// the looser list-page `findUriValidationMessages` (URL.canParse only,
// hard-coded Indonesian strings). This module consolidates BOTH onto the
// stricter create-form rules and returns i18n KEYS only (never literal copy).
// The client_id regex matches the backend integration contract: 3–63 chars,
// lowercase alnum + hyphen, must start alnum. No Nuxt, no network. No
// client_secret is read or constructed here.

import type {
  ClientCategory,
  ClientCreatePayload,
  ClientType,
  ScopeCatalogEntry,
} from '@/types/clients.types'

export type ClientCreateForm = {
  display_name: string
  client_id: string
  owner_email: string
  client_type: ClientType | null
  category: ClientCategory | ''
  redirect_uri: string
  backchannel_logout_uri: string
}

const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/u
const OWNER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const DEFAULT_LOGOUT_PATH = '/auth/backchannel/logout'

export function slugifyClientId(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63)
}

export function isValidClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value)
}

export function isValidOwnerEmail(value: string): boolean {
  return OWNER_EMAIL_PATTERN.test(value)
}

// Strict redirect rule (the consolidated source of truth): a parseable URL,
// http/https only, no `*` wildcard, no query string.
export function isRedirectUri(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (value.includes('*')) return false
  if (url.search !== '') return false
  return true
}

// Backchannel logout is optional; when present it follows the redirect rules
// AND must share the redirect's origin.
export function isBackchannelUri(value: string, redirectUri: string): boolean {
  if (value.trim() === '') return true
  if (!isRedirectUri(value)) return false
  try {
    return new URL(value).origin === new URL(redirectUri).origin
  } catch {
    return false
  }
}

export function parseScopes(value: string): readonly string[] {
  const parts = value
    .split(/[\s,]+/u)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return [...new Set(parts)]
}

export function validateClientCreateForm(
  form: ClientCreateForm,
  selectedScopes: readonly string[],
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {}
  if (form.display_name.trim() === '') errors.display_name = 'clients.validation_display_name'
  if (!isValidClientId(form.client_id)) errors.client_id = 'clients.validation_client_id'
  if (!isValidOwnerEmail(form.owner_email)) errors.owner_email = 'clients.validation_owner_email'
  if (form.client_type == null) errors.client_type = 'clients.validation_client_type'
  if (form.category === '') errors.category = 'clients.validation_category'
  if (!isRedirectUri(form.redirect_uri)) errors.redirect_uri = 'clients.validation_redirect_uri'
  if (!isBackchannelUri(form.backchannel_logout_uri, form.redirect_uri)) {
    errors.backchannel_logout_uri = 'clients.validation_logout_uri'
  }
  if (selectedScopes.length === 0 || !selectedScopes.includes('openid')) {
    errors.scopes = 'clients.validation_scopes'
  }
  return errors
}

// Mirrors the backend ClientIntegrationContractBuilder: category is REQUIRED so
// a staff app can never be silently published as public. Throws on the unset
// invariants so callers must validate first.
export function toClientCreatePayload(
  form: ClientCreateForm,
  selectedScopes: readonly string[],
): ClientCreatePayload {
  if (form.client_type == null) throw new Error('client_type is required')
  if (form.category === '') throw new Error('category is required')
  const redirect = new URL(form.redirect_uri)
  const backchannel = form.backchannel_logout_uri.trim()
  const logoutPath = backchannel === '' ? DEFAULT_LOGOUT_PATH : new URL(backchannel).pathname
  return {
    app_name: form.display_name.trim(),
    client_id: form.client_id,
    environment: 'development',
    client_type: form.client_type,
    app_base_url: redirect.origin,
    callback_path: redirect.pathname,
    logout_path: logoutPath,
    owner_email: form.owner_email.trim(),
    provisioning: 'jit',
    allowed_scopes: [...selectedScopes],
    category: form.category,
  }
}

// Consolidated edit-form validator: one i18n key or null. Reuses the strict
// create-form rules so the edit form and create form agree byte-for-byte.
// ponytail: returns the FIRST error found — caller renders one message at a time.
export function validateUriPolicy(input: {
  redirect_uris: readonly string[]
  post_logout_redirect_uris: readonly string[]
  backchannel_logout_uri: string
}): string | null {
  const redirects = input.redirect_uris.map((u) => u.trim()).filter((u) => u !== '')
  if (redirects.length === 0) return 'clients.validation_redirect_uri'
  for (const uri of redirects) {
    if (!isRedirectUri(uri)) return 'clients.validation_redirect_uri'
  }
  const baseOrigin = new URL(redirects[0]!).origin

  const logouts = input.post_logout_redirect_uris.map((u) => u.trim()).filter((u) => u !== '')
  for (const uri of logouts) {
    if (!isRedirectUri(uri)) return 'clients.validation_logout_uri'
    if (new URL(uri).origin !== baseOrigin) return 'clients.validation_logout_origin'
  }

  const all = [...redirects, ...logouts]
  if (new Set(all).size !== all.length) return 'clients.validation_uri_duplicate'

  const backchannel = input.backchannel_logout_uri.trim()
  if (backchannel !== '') {
    if (!isRedirectUri(backchannel)) return 'clients.validation_logout_uri'
    if (new URL(backchannel).origin !== baseOrigin) return 'clients.validation_logout_origin'
  }
  return null
}

export function mergeAvailableScopes(
  catalog: readonly ScopeCatalogEntry[],
  clientScopes: readonly string[],
): readonly string[] {
  const names = catalog.map((entry) => entry.name)
  const known = new Set(names)
  const extra = clientScopes.filter((scope) => !known.has(scope))
  return [...names, ...new Set(extra)]
}

export function scopeParityWarnings(
  catalog: readonly ScopeCatalogEntry[],
  clientScopes: readonly string[],
): readonly string[] {
  const known = new Set(catalog.map((entry) => entry.name))
  return clientScopes.filter((scope) => !known.has(scope))
}
