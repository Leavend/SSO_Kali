import { adminFetch, jsonRequest } from './admin-api.js'
import type { AdminSession } from './session.js'

export function updateClient(
  session: AdminSession,
  clientId: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return adminFetch(`/clients/${encodeURIComponent(clientId)}`, session, {
    ...jsonRequest(body),
    method: 'PATCH',
  })
}

export function rotateClientSecret(session: AdminSession, clientId: string): Promise<unknown> {
  return adminFetch(
    `/clients/${encodeURIComponent(clientId)}/rotate-secret`,
    session,
    jsonRequest({}),
  )
}

export function syncClientScopes(
  session: AdminSession,
  clientId: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return adminFetch(`/clients/${encodeURIComponent(clientId)}/scopes`, session, {
    ...jsonRequest(body),
    method: 'PUT',
  })
}

export function decommissionClient(session: AdminSession, clientId: string): Promise<unknown> {
  return adminFetch(`/clients/${encodeURIComponent(clientId)}`, session, { method: 'DELETE' })
}
