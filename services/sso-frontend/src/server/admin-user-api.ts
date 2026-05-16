import { adminFetch, jsonRequest } from './admin-api.js'
import type { AdminSession } from './session.js'

export function createUser(session: AdminSession, body: Record<string, unknown>): Promise<unknown> {
  return adminFetch('/users', session, jsonRequest(body))
}

export function userLifecycleAction(
  session: AdminSession,
  subjectId: string,
  action: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return adminFetch(`/users/${encodeURIComponent(subjectId)}/${action}`, session, jsonRequest(body))
}
