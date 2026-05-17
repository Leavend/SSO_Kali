import { randomBytes } from 'node:crypto'
import { createClient, type RedisClientType } from 'redis'
import { getConfig } from './config.js'
import type { PortalSession } from './session.js'
import { unixTime } from './session.js'

const sessionKeyPrefix = 'portal:sessions:'
const memorySessions = new Map<string, PortalSession>()
let redisClient: RedisClientType | null = null

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

export async function replaceSessionRecord(sessionId: string, session: PortalSession): Promise<void> {
  await writeSessionRecord(sessionId, session)
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  memorySessions.delete(sessionId)
  const client = await redis()
  if (client) await client.del(sessionStoreKey(sessionId))
}

export function sessionStoreKey(sessionId: string): string {
  return `${sessionKeyPrefix}${sessionId}`
}

async function writeSessionRecord(sessionId: string, session: PortalSession): Promise<void> {
  memorySessions.set(sessionId, session)
  const client = await redis()
  if (client) await client.set(sessionStoreKey(sessionId), JSON.stringify(session), { EX: maxAge(session) })
}

async function readPersistedSession(sessionId: string): Promise<PortalSession | null> {
  const client = await redis()
  const value = client ? await client.get(sessionStoreKey(sessionId)) : null
  if (value) return JSON.parse(value) as PortalSession
  return memorySessions.get(sessionId) ?? null
}

async function redis(): Promise<RedisClientType | null> {
  if (!getConfig().sessionRedisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SSO_FRONTEND_SESSION_REDIS_URL must be configured in production.')
    }
    return null
  }
  if (redisClient) return redisClient

  const sessionRedisUrl = getConfig().sessionRedisUrl
  if (!sessionRedisUrl) return null

  redisClient = createClient({ url: sessionRedisUrl })
  redisClient.on('error', (error: Error) => console.error('Portal session Redis error:', error.message))
  await redisClient.connect()
  return redisClient
}

function maxAge(session: PortalSession): number {
  return Math.max(1, Math.min(getConfig().sessionIdleTtlSeconds, session.absoluteExpiresAt - unixTime()))
}
