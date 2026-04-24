import { describe, expect, it } from "vitest";
import { buildAdminLoginHref, normalizeReturnTo } from "@/lib/admin-login-url";

describe("admin login url helpers", () => {
  it("builds a safe login href with return_to", () => {
    expect(buildAdminLoginHref("/sessions")).toBe("/auth/login?return_to=%2Fsessions");
  });

  it("drops unsafe callback or absolute paths", () => {
    expect(normalizeReturnTo("//evil.example")).toBeNull();
    expect(normalizeReturnTo("/auth/callback")).toBeNull();
    expect(buildAdminLoginHref("/auth/callback")).toBe("/auth/login");
  });
});
