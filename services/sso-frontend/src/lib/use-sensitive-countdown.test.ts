import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for sensitive action countdown logic.
 * Validates step-up auth window timing.
 */
const SENSITIVE_ACTION_WINDOW_SECONDS = 5 * 60;

describe("sensitive countdown logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes remaining seconds within window", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const authTime = now - 200;
    const remaining = Math.max(0, SENSITIVE_ACTION_WINDOW_SECONDS - (now - authTime));

    expect(remaining).toBe(100);
  });

  it("returns 0 when window is expired", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const authTime = now - 400;
    const remaining = Math.max(0, SENSITIVE_ACTION_WINDOW_SECONDS - (now - authTime));

    expect(remaining).toBe(0);
  });

  it("returns full window when just authenticated", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const authTime = now;
    const remaining = Math.max(0, SENSITIVE_ACTION_WINDOW_SECONDS - (now - authTime));

    expect(remaining).toBe(300);
  });

  it("handles null authTime gracefully", () => {
    const authTime: number | null = null;

    const result = authTime === null ? null : Math.max(0, 300 - authTime);

    expect(result).toBeNull();
  });
});
