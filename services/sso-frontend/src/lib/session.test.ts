import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const decryptSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@/lib/session-crypto", () => ({
  decryptSession,
  encryptSession: vi.fn(),
}));

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for expired sessions without mutating cookies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T09:00:00Z"));

    const jar = createJar("encrypted-session");
    cookies.mockResolvedValue(jar);
    decryptSession.mockReturnValue(JSON.stringify(buildSession(1_744_189_560)));

    const { getSession } = await import("@/lib/session");
    const session = await getSession();

    expect(session).toBeNull();
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("returns the parsed session when the cookie is valid", async () => {
    const payload = buildSession(2_000_000_000);
    const jar = createJar("encrypted-session");
    cookies.mockResolvedValue(jar);
    decryptSession.mockReturnValue(JSON.stringify(payload));

    const { getSession } = await import("@/lib/session");
    const session = await getSession();

    expect(session).toEqual(payload);
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();
  });
});

function createJar(value: string) {
  return {
    delete: vi.fn(),
    get: vi.fn().mockReturnValue({ value }),
    set: vi.fn(),
  };
}

function buildSession(expiresAt: number) {
  return {
    accessToken: "access-token",
    idToken: "id-token",
    refreshToken: "refresh-token",
    sub: "123456789",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    expiresAt,
    authTime: 1_744_189_000,
    amr: ["pwd"],
    acr: "urn:example:loa:2",
    lastLoginAt: "2026-04-09T09:00:00Z",
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  };
}
