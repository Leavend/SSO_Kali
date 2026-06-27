import { randomBytes } from 'node:crypto'
import type { PortalSession } from './session'
import { unixTime } from './session'

const sessionKeyPrefix = 'admin:sessions:'
const memorySessions = new Map<string, PortalSession>()

export async function createSessionRecord(session: PortalSession): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url')
  await writeSessionRecord(sessionId, session)
  return sessionId
}

export async function readSessionRecord(sessionId: string): Promise<PortalSession | null> {
  const session = await readPersistedSession(sessionId)
  if (!session || session.absoluteExpiresAt <= unixTime()) {
    await deleteSessionRecord(sessionId)
    return null
  }

  return session
}

export async function replaceSessionRecord(
  sessionId: string,
  session: PortalSession,
): Promise<void> {
  await writeSessionRecord(sessionId, session)
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  memorySessions.delete(sessionId)
}

export function sessionStoreKey(sessionId: string): string {
  return `${sessionKeyPrefix}${sessionId}`
}

async function writeSessionRecord(sessionId: string, session: PortalSession): Promise<void> {
  memorySessions.set(sessionId, session)
}

async function readPersistedSession(sessionId: string): Promise<PortalSession | null> {
  return memorySessions.get(sessionId) ?? null
}
