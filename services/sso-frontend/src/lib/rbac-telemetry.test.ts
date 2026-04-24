import { afterEach, describe, expect, it, vi } from "vitest";
import { recordForbiddenAttempt } from "@/lib/rbac-telemetry";

describe("RBAC telemetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured forbidden attempts", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    recordForbiddenAttempt({
      pathname: "/sessions",
      reason: "admin_api_denied",
      role: "viewer",
      status: 403,
      subjectId: "123456789",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("[ADMIN_RBAC_FORBIDDEN]");
    expect(warn.mock.calls[0]?.[0]).toContain("\"pathname\":\"/sessions\"");
    expect(warn.mock.calls[0]?.[0]).toContain("\"status\":403");
  });
});
