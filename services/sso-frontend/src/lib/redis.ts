import { createClient } from "redis";

type FrontendRedisClient = ReturnType<typeof createClient>;

type FrontendRedisGlobals = typeof globalThis & {
  __ssoFrontendRedisClient: FrontendRedisClient | undefined;
};

const redisGlobals = globalThis as FrontendRedisGlobals;

function redisUrl(): string | null {
  const value = process.env.SSO_FRONTEND_REDIS_URL?.trim() ?? "";
  return value === "" ? null : value;
}

function buildClient(url: string): FrontendRedisClient {
  const client = createClient({ url });
  client.on("error", (err: unknown) => {
    console.error("[sso-frontend] Redis client error:", err);
  });
  return client;
}

async function connectClient(url: string): Promise<FrontendRedisClient | null> {
  const client = redisGlobals.__ssoFrontendRedisClient ?? buildClient(url);
  redisGlobals.__ssoFrontendRedisClient = client;

  try {
    if (!client.isOpen) {
      await client.connect();
    }

    return client;
  } catch {
    redisGlobals.__ssoFrontendRedisClient = undefined;
    return null;
  }
}

export async function redisIncrement(key: string): Promise<void> {
  const url = redisUrl();

  if (!url) {
    return;
  }

  const client = await connectClient(url);

  if (!client) {
    return;
  }

  await client.incr(key);
}
