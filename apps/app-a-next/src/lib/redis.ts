import { createClient } from "redis";
import { getServerConfig } from "@/lib/app-config";

type AppRedisClient = ReturnType<typeof createClient>;

let client: AppRedisClient | null = null;
let connection: Promise<AppRedisClient> | null = null;

export async function getRedisClient(): Promise<AppRedisClient> {
  if (client?.isOpen) {
    return client;
  }

  connection ??= connectRedis();

  return connection;
}

async function connectRedis(): Promise<AppRedisClient> {
  const nextClient = createClient({ url: getServerConfig().redisUrl });

  nextClient.on("error", () => undefined);
  await nextClient.connect();
  client = nextClient;

  return nextClient;
}
