import type { ClientSecretRotation } from '@/types/clients.types'

/**
 * Resolve the one-time plaintext secret from a create / rotate-secret response.
 * The backend has used four field names for the same value over time; resolve
 * them in priority order. Returns null when none is present (public clients
 * have no secret). The result is a transient value — the caller MUST hold it
 * only in a client-only ref and never persist or log it.
 */
export function extractRevealedSecret(
  rotation: ClientSecretRotation | null | undefined,
): string | null {
  if (!rotation) return null
  return (
    rotation.plaintext_secret ??
    rotation.plaintext_once ??
    rotation.client_secret ??
    rotation.secret ??
    null
  )
}

export interface ClientEnvSnippetInput {
  readonly clientId: string
  readonly secret?: string | null
  readonly issuer?: string
  readonly redirectUri?: string
  readonly postLogoutUri?: string
  readonly scopes?: readonly string[]
}

/**
 * Build the copy-paste `SSO_*` environment block for a freshly registered
 * client. The secret line is emitted ONLY when a secret is supplied (public
 * clients omit it). Pure string — nothing here is logged or persisted.
 * `SSO_ISSUER` is intentionally omitted: no caller supplies `issuer` (it would
 * have come from the deferred contract endpoint, see Architecture "Out of
 * scope"), so the operator fills the issuer in by hand.
 */
export function buildClientEnvSnippet(input: ClientEnvSnippetInput): string {
  const lines: string[] = []
  if (input.issuer) lines.push(`SSO_ISSUER=${input.issuer}`)
  lines.push(`SSO_CLIENT_ID=${input.clientId}`)
  if (input.secret) lines.push(`SSO_CLIENT_SECRET=${input.secret}`)
  if (input.redirectUri) lines.push(`SSO_REDIRECT_URI=${input.redirectUri}`)
  if (input.postLogoutUri) lines.push(`SSO_POST_LOGOUT_URI=${input.postLogoutUri}`)
  if (input.scopes && input.scopes.length > 0) {
    lines.push(`SSO_SCOPES=${input.scopes.join(' ')}`)
  }
  return lines.join('\n')
}
