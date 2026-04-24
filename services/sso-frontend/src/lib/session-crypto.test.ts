import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubEnv("SESSION_ENCRYPTION_SECRET", "a3f9c1b8e47d2a06f5e8d3b1c9a7f4e2d6b0e8a1c4f7d3b9e5a2f8c6d0b4e7a1");

describe("session-crypto", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("encrypts and decrypts a session roundtrip", async () => {
    const { encryptSession, decryptSession } = await import("@/lib/session-crypto");
    const payload = JSON.stringify({ sub: "user123", role: "admin" });

    const encrypted = encryptSession(payload);
    const decrypted = decryptSession(encrypted);

    expect(decrypted).toBe(payload);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const { encryptSession } = await import("@/lib/session-crypto");
    const payload = "same-payload";

    const a = encryptSession(payload);
    const b = encryptSession(payload);

    expect(a).not.toBe(b);
  });

  it("returns null for corrupted ciphertext", async () => {
    const { decryptSession } = await import("@/lib/session-crypto");

    expect(decryptSession("corrupted-data")).toBeNull();
    expect(decryptSession("")).toBeNull();
    expect(decryptSession("dG9vLXNob3J0")).toBeNull();
  });

  it("returns null when auth tag is tampered", async () => {
    const { encryptSession, decryptSession } = await import("@/lib/session-crypto");
    const encrypted = encryptSession("test-payload");

    // Flip a byte in the ciphertext to simulate tampering
    const buf = Buffer.from(encrypted, "base64url");
    const lastIdx = buf.length - 1;
    buf[lastIdx] = (buf[lastIdx] ?? 0) ^ 0xff;
    const tampered = buf.toString("base64url");

    expect(decryptSession(tampered)).toBeNull();
  });

  it("throws when secret is too short", async () => {
    vi.stubEnv("SESSION_ENCRYPTION_SECRET", "too-short");
    vi.resetModules();

    await expect(async () => {
      const mod = await import("@/lib/session-crypto");
      mod.encryptSession("test");
    }).rejects.toThrow();
  });
});
