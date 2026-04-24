import { describe, expect, it } from "vitest";
import {
  isAdminSessionFresh,
  isSensitiveActionFresh,
  requiresAdminSessionReauth,
  requiresSensitiveActionStepUp,
} from "@/lib/admin-freshness";

describe("admin freshness policy", () => {
  it("keeps the admin panel readable within the 55-minute freshness window", () => {
    expect(isAdminSessionFresh(1_800_000_000, 1_800_003_299_000)).toBe(true);
    expect(requiresAdminSessionReauth(1_800_000_000, 1_800_003_299_000)).toBe(false);
  });

  it("requires admin reauthentication when the 55-minute window expires", () => {
    expect(isAdminSessionFresh(1_800_000_000, 1_800_003_301_000)).toBe(false);
    expect(requiresAdminSessionReauth(1_800_000_000, 1_800_003_301_000)).toBe(true);
    expect(requiresAdminSessionReauth(null, 1_800_000_100_000)).toBe(true);
  });

  it("allows sensitive actions within the 5-minute window", () => {
    expect(isSensitiveActionFresh(1_800_000_000, 1_800_000_299_000)).toBe(true);
    expect(requiresSensitiveActionStepUp(1_800_000_000, 1_800_000_299_000)).toBe(false);
  });

  it("requires step-up when auth_time is too old or missing", () => {
    expect(isSensitiveActionFresh(1_800_000_000, 1_800_000_301_000)).toBe(false);
    expect(requiresSensitiveActionStepUp(1_800_000_000, 1_800_000_301_000)).toBe(true);
    expect(requiresSensitiveActionStepUp(null, 1_800_000_100_000)).toBe(true);
  });
});
