import { randomUUID } from "node:crypto";
import { getServerConfig } from "@/lib/app-config";
import { getRedisClient } from "@/lib/redis";

export type AppSession = {
  readonly sessionId: string;
  readonly sid: string;
  readonly subject: string;
  readonly clientId: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string;
  readonly expiresAt: number;
  readonly createdAt: number;
  readonly lastTouchedAt: number;
  readonly lastRefreshedAt: number;
  readonly profile: {
    readonly email: string;
    readonly display_name: string;
    readonly risk_score: number;
    readonly mfa_required: boolean;
  };
};

export type StoredAuthTransaction = {
  readonly codeVerifier: string;
  readonly nonce: string;
};

export type SessionTokenUpdate = Pick<
  AppSession,
  "accessToken" | "expiresAt" | "idToken" | "refreshToken"
>;

export type NewAppSession = Omit<
  AppSession,
  "createdAt" | "lastRefreshedAt" | "lastTouchedAt" | "sessionId"
>;

type IndexedSessionDelete = {
  readonly sessionId: string;
  readonly session: AppSession | null;
};

export async function storeAuthTransaction(
  state: string,
  transaction: StoredAuthTransaction,
): Promise<void> {
  const redis = await getRedisClient();

  await redis.set(transactionKey(state), JSON.stringify(transaction), { EX: 300 });
}

export async function pullAuthTransaction(state: string): Promise<StoredAuthTransaction | null> {
  const redis = await getRedisClient();
  const payload = await redis.getDel(transactionKey(state));

  return parseJson<StoredAuthTransaction>(payload);
}

export async function createSession(session: NewAppSession): Promise<AppSession> {
  const now = unixTime();
  const nextSession = withSessionDefaults(session, randomUUID(), now);

  await saveSession(nextSession);

  return nextSession;
}

export async function findSession(sessionId: string): Promise<AppSession | null> {
  const session = normalizeSession(await readSession(sessionId));

  if (session === null) return null;
  if (sessionExpired(session)) return deleteAndReturnNull(session);

  const touchedSession = { ...session, lastTouchedAt: unixTime() };
  await saveSession(touchedSession);

  return touchedSession;
}

export async function replaceSessionTokens(
  sessionId: string,
  update: SessionTokenUpdate,
): Promise<AppSession | null> {
  const session = normalizeSession(await readSession(sessionId));

  if (session === null || sessionExpired(session)) return null;

  const nextSession = { ...session, ...update, lastRefreshedAt: unixTime() };
  await saveSession(nextSession);

  return nextSession;
}

export async function destroySession(sessionId: string): Promise<void> {
  const session = normalizeSession(await readSession(sessionId));

  if (session === null) return;

  await deleteSession(session);
}

export async function destroySessionsBySid(sid: string): Promise<number> {
  const redis = await getRedisClient();
  const sessionIds = await redis.sMembers(sessionIndexKey(sid));

  return destroyIndexedSessions(sessionIds, sessionIndexKey(sid));
}

export async function destroySessionsBySubject(subject: string): Promise<number> {
  const redis = await getRedisClient();
  const sessionIds = await redis.sMembers(subjectIndexKey(subject));

  return destroyIndexedSessions(sessionIds, subjectIndexKey(subject));
}

async function destroyIndexedSessions(sessionIds: string[], indexKey: string): Promise<number> {
  if (sessionIds.length === 0) return 0;

  const sessions = await Promise.all(sessionIds.map(readSession));
  const deletes = indexedSessionDeletes(sessionIds, sessions);

  await deleteIndexedSessions(deletes, indexKey);

  return sessions.filter((session) => session !== null).length;
}

function indexedSessionDeletes(
  sessionIds: string[],
  sessions: (AppSession | null)[],
): IndexedSessionDelete[] {
  return sessionIds.map((sessionId, index) => ({ sessionId, session: sessions[index] ?? null }));
}

async function deleteIndexedSessions(items: IndexedSessionDelete[], indexKey: string): Promise<void> {
  const redis = await getRedisClient();
  const pipeline = redis.multi();

  for (const item of items) {
    pipeline.del(sessionKey(item.sessionId));
    if (item.session === null) continue;
    pipeline.sRem(sessionIndexKey(item.session.sid), item.session.sessionId);
    pipeline.sRem(subjectIndexKey(item.session.subject), item.session.sessionId);
  }

  pipeline.del(indexKey);
  await pipeline.exec();
}

export async function tryAcquireRefreshLock(sessionId: string): Promise<boolean> {
  const redis = await getRedisClient();
  const result = await redis.set(refreshLockKey(sessionId), "1", {
    EX: refreshLockTtlSeconds(),
    NX: true,
  });

  return result === "OK";
}

export async function releaseRefreshLock(sessionId: string): Promise<void> {
  const redis = await getRedisClient();

  await redis.del(refreshLockKey(sessionId));
}

export async function waitForSessionRefresh(
  sessionId: string,
  previousRefreshedAt: number,
): Promise<AppSession | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(150);
    const session = await findSession(sessionId);
    if (session !== null && session.lastRefreshedAt > previousRefreshedAt) return session;
  }

  return null;
}

async function readSession(sessionId: string): Promise<AppSession | null> {
  const redis = await getRedisClient();
  const payload = await redis.get(sessionKey(sessionId));

  return parseJson<AppSession>(payload);
}

async function saveSession(session: AppSession): Promise<void> {
  const redis = await getRedisClient();
  const ttl = activeTtlSeconds(session);

  await redis.set(sessionKey(session.sessionId), JSON.stringify(session), { EX: ttl });
  await redis.sAdd(sessionIndexKey(session.sid), session.sessionId);
  await redis.sAdd(subjectIndexKey(session.subject), session.sessionId);
  await redis.expire(sessionIndexKey(session.sid), ttl);
  await redis.expire(subjectIndexKey(session.subject), ttl);
}

async function deleteAndReturnNull(session: AppSession): Promise<null> {
  await deleteSession(session);

  return null;
}

async function deleteSession(session: AppSession): Promise<void> {
  const redis = await getRedisClient();

  await redis.del(sessionKey(session.sessionId));
  await redis.sRem(sessionIndexKey(session.sid), session.sessionId);
  await redis.sRem(subjectIndexKey(session.subject), session.sessionId);
}

function withSessionDefaults(session: NewAppSession, sessionId: string, now: number): AppSession {
  return {
    ...session,
    sessionId,
    createdAt: now,
    lastTouchedAt: now,
    lastRefreshedAt: now,
  };
}

function normalizeSession(session: AppSession | null): AppSession | null {
  if (session === null) return null;

  const now = unixTime();
  const partial = session as Partial<AppSession>;

  return {
    ...session,
    createdAt: numberOr(partial.createdAt, now),
    lastTouchedAt: numberOr(partial.lastTouchedAt, now),
    lastRefreshedAt: numberOr(partial.lastRefreshedAt, now),
    refreshToken: stringOrNull(partial.refreshToken),
  };
}

function activeTtlSeconds(session: AppSession): number {
  return Math.max(1, Math.min(idleRemainingSeconds(session), absoluteRemainingSeconds(session)));
}

function sessionExpired(session: AppSession): boolean {
  return idleRemainingSeconds(session) <= 0 || absoluteRemainingSeconds(session) <= 0;
}

function idleRemainingSeconds(session: AppSession): number {
  return getServerConfig().sessionIdleTtlSeconds - (unixTime() - session.lastTouchedAt);
}

function absoluteRemainingSeconds(session: AppSession): number {
  return getServerConfig().sessionAbsoluteTtlSeconds - (unixTime() - session.createdAt);
}

function refreshLockTtlSeconds(): number {
  return Math.max(1, getServerConfig().refreshLockTtlSeconds);
}

function parseJson<T>(payload: string | null): T | null {
  return payload === null ? null : (JSON.parse(payload) as T);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function transactionKey(state: string): string {
  return `app-a:tx:${state}`;
}

function sessionKey(sessionId: string): string {
  return `app-a:session:${sessionId}`;
}

function sessionIndexKey(sid: string): string {
  return `app-a:sid:${sid}`;
}

function subjectIndexKey(subject: string): string {
  return `app-a:subject:${subject}`;
}

function refreshLockKey(sessionId: string): string {
  return `app-a:refresh-lock:${sessionId}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
