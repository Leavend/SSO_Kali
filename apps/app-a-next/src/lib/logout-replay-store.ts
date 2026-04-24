import { getRedisClient } from "@/lib/redis";

export async function rememberLogoutTokenJti(jti: string, expiresAt: number): Promise<void> {
  const redis = await getRedisClient();
  const ttlSeconds = secondsUntilExpiry(expiresAt);
  const result = await redis.set(replayKey(jti), "1", { NX: true, EX: ttlSeconds });

  if (result === "OK") {
    return;
  }

  await redis.incr(metricsKey());
  console.warn("[BACKCHANNEL_LOGOUT_REPLAY_DETECTED]", { jti });
  throw new Error("Logout token replay detected.");
}

function secondsUntilExpiry(expiresAt: number): number {
  return Math.max(1, expiresAt - unixTime());
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

function replayKey(jti: string): string {
  return `app-a:logout-jti:${jti}`;
}

function metricsKey(): string {
  return "app-a:metrics:logout_replay_alert_total";
}
