import { Buffer } from 'node:buffer'
import { buildAdminApiError } from './admin-api-error.js'
import { adminFetch, adminFetchRaw } from './admin-api.js'
import type { AdminSession } from './session.js'

export function fetchAuditEvents(session: AdminSession, search: string): Promise<unknown> {
  return adminFetch(`/audit/events${search}`, session)
}

export function fetchAuditIntegrity(session: AdminSession): Promise<unknown> {
  return adminFetch('/audit/integrity', session)
}

export async function exportAuditEvents(
  session: AdminSession,
  search: string,
): Promise<{ readonly body: Buffer; readonly headers: Record<string, string> }> {
  const response = await adminFetchRaw(`/audit/export${search}`, session)
  if (!response.ok) throw await buildAdminApiError(response)

  return {
    body: Buffer.from(await response.arrayBuffer()),
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': response.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  }
}
