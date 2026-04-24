import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/redis";

export type AppSession = {
  readonly sessionId: string;
  readonly sid: string;
  readonly subject: string;
  readonly clientId: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly idToken: string;
  readonly expiresAt: number;
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

const ttlSeconds = 60 * 60 * 24 * 30;

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

export async function createSession(session: Omit<AppSession, "sessionId">): Promise<AppSession> {
  const nextSession = { ...session, sessionId: randomUUID() };

  await saveSession(nextSession);

  return nextSession;
}

export async function findSession(sessionId: string): Promise<AppSession | null> {
  const redis = await getRedisClient();
  const payload = await redis.get(sessionKey(sessionId));

  return parseJson<AppSession>(payload);
}

export async function destroySession(sessionId: string): Promise<void> {
  const session = await findSession(sessionId);

  if (session === null) {
    return;
  }

  const redis = await getRedisClient();

  await redis.del(sessionKey(sessionId));
  await redis.sRem(sessionIndexKey(session.sid), sessionId);
}

export async function destroySessionsBySid(sid: string): Promise<number> {
  const redis = await getRedisClient();
  const sessionIds = await redis.sMembers(sessionIndexKey(sid));

  if (sessionIds.length === 0) {
    return 0;
  }

  const pipeline = redis.multi();

  sessionIds.forEach((sessionId) => pipeline.del(sessionKey(sessionId)));
  pipeline.del(sessionIndexKey(sid));
  await pipeline.exec();

  return sessionIds.length;
}

async function saveSession(session: AppSession): Promise<void> {
  const redis = await getRedisClient();

  await redis.set(sessionKey(session.sessionId), JSON.stringify(session), { EX: ttlSeconds });
  await redis.sAdd(sessionIndexKey(session.sid), session.sessionId);
  await redis.expire(sessionIndexKey(session.sid), ttlSeconds);
}

function parseJson<T>(payload: string | null): T | null {
  if (payload === null) {
    return null;
  }

  return JSON.parse(payload) as T;
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
