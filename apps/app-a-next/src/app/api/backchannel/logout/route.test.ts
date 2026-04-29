import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const destroySessionsBySid = vi.fn();
const destroySessionsBySubject = vi.fn();
const verifyLogoutToken = vi.fn();

vi.mock("@/lib/session-store", () => ({
  destroySessionsBySid,
  destroySessionsBySubject,
}));

vi.mock("@/lib/logout-token", () => ({
  verifyLogoutToken,
}));

describe("POST /api/backchannel/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears sessions after a valid logout token", async () => {
    verifyLogoutToken.mockResolvedValue({
      jti: "logout-jti-1",
      sid: "shared-sid",
      sub: "subject-123",
    });
    destroySessionsBySid.mockResolvedValue(2);
    destroySessionsBySubject.mockResolvedValue(0);

    const { POST } = await import("@/app/api/backchannel/logout/route");
    const response = await POST(requestWithToken("logout-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cleared: 2,
      sid: "shared-sid",
      sub: "subject-123",
    });
    expect(destroySessionsBySubject).toHaveBeenCalledWith("subject-123");
  });

  it("rejects replayed logout tokens", async () => {
    verifyLogoutToken.mockRejectedValue(new Error("Logout token replay detected."));

    const { POST } = await import("@/app/api/backchannel/logout/route");
    const response = await POST(requestWithToken("logout-token"));

    expect(response.status).toBe(401);
    expect(destroySessionsBySid).not.toHaveBeenCalled();
    expect(destroySessionsBySubject).not.toHaveBeenCalled();
  });

  it("rejects expired logout tokens without clearing sessions", async () => {
    verifyLogoutToken.mockRejectedValue(new Error("Logout token has expired."));

    const { POST } = await import("@/app/api/backchannel/logout/route");
    const response = await POST(requestWithToken("expired-token"));

    expect(response.status).toBe(401);
    expect(destroySessionsBySid).not.toHaveBeenCalled();
    expect(destroySessionsBySubject).not.toHaveBeenCalled();
  });

  it("clears sessions by subject when a logout token omits sid", async () => {
    verifyLogoutToken.mockResolvedValue({
      jti: "logout-jti-2",
      sid: "",
      sub: "subject-123",
    });
    destroySessionsBySubject.mockResolvedValue(3);

    const { POST } = await import("@/app/api/backchannel/logout/route");
    const response = await POST(requestWithToken("logout-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cleared: 3, sid: "", sub: "subject-123" });
    expect(destroySessionsBySid).not.toHaveBeenCalled();
    expect(destroySessionsBySubject).toHaveBeenCalledWith("subject-123");
  });
});

function requestWithToken(token: string): NextRequest {
  const body = new URLSearchParams({ logout_token: token });

  return new NextRequest("http://app-a.example/api/backchannel/logout", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });
}
