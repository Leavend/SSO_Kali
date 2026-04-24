import { describe, expect, it, vi } from "vitest";

const redisIncrement = vi.fn();

vi.mock("@/lib/redis", () => ({
  redisIncrement,
}));

describe("admin auth funnel telemetry", () => {
  it("builds stable metric keys", async () => {
    const { adminAuthFunnelMetricKey } = await import("@/lib/admin-auth-funnel");

    expect(adminAuthFunnelMetricKey("admin_login_started")).toBe(
      "sso-frontend:metrics:admin_auth_funnel_total:admin_login_started",
    );
  });

  it("increments the redis counter for an event", async () => {
    const { recordAdminAuthFunnelEvent } = await import("@/lib/admin-auth-funnel");

    recordAdminAuthFunnelEvent("admin_login_success");

    expect(redisIncrement).toHaveBeenCalledWith(
      "sso-frontend:metrics:admin_auth_funnel_total:admin_login_success",
    );
  });

  it("does not block or throw when redis increment fails", async () => {
    redisIncrement.mockRejectedValueOnce(new Error("redis down"));

    const { recordAdminAuthFunnelEvent } = await import("@/lib/admin-auth-funnel");

    expect(() => {
      recordAdminAuthFunnelEvent("admin_login_page_view");
    }).not.toThrow();
  });
});
