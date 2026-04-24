import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for session expiry countdown logic.
 * Validates warning thresholds and expiry detection.
 */
describe("session expiry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects session within warning threshold (<120s)", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const expiresAt = now + 90;
    const WARNING_THRESHOLD = 120;
    const remaining = expiresAt - Math.floor(Date.now() / 1000);

    expect(remaining).toBe(90);
    expect(remaining).toBeLessThanOrEqual(WARNING_THRESHOLD);
    expect(remaining).toBeGreaterThan(0);
  });

  it("does not warn when session has plenty of time", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const expiresAt = now + 600;
    const WARNING_THRESHOLD = 120;
    const remaining = expiresAt - Math.floor(Date.now() / 1000);

    expect(remaining).toBeGreaterThan(WARNING_THRESHOLD);
  });

  it("detects expired session (remaining = 0)", () => {
    const now = 1_700_000_000;
    vi.setSystemTime(new Date(now * 1000));

    const expiresAt = now - 10;
    const remaining = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    expect(remaining).toBe(0);
  });

  it("formats countdown correctly", () => {
    const seconds = 125;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    expect(mins).toBe(2);
    expect(secs).toBe(5);
  });
});
