import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRedisClient = vi.fn();
const redis = {
  set: vi.fn(),
  incr: vi.fn(),
};

vi.mock("@/lib/redis", () => ({
  getRedisClient,
}));

describe("logout replay store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRedisClient.mockResolvedValue(redis);
    redis.set.mockResolvedValue("OK");
    redis.incr.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores a logout token jti with NX semantics", async () => {
    const { rememberLogoutTokenJti } = await import("@/lib/logout-replay-store");

    await rememberLogoutTokenJti("logout-jti-1", unixTime() + 120);

    expect(redis.set).toHaveBeenCalledWith(
      "app-a:logout-jti:logout-jti-1",
      "1",
      expect.objectContaining({ NX: true }),
    );
  });

  it("rejects replayed logout token jti and records an alert", async () => {
    redis.set.mockResolvedValue(null);

    const { rememberLogoutTokenJti } = await import("@/lib/logout-replay-store");

    await expect(rememberLogoutTokenJti("logout-jti-2", unixTime() + 120))
      .rejects.toThrow("replay");

    expect(redis.incr).toHaveBeenCalledWith("app-a:metrics:logout_replay_alert_total");
  });
});

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
