import { describe, expect, it } from "vitest";
import { isActiveAdminPath } from "@/lib/admin-nav";

describe("admin-nav", () => {
  it("matches nested resources to their parent section", () => {
    expect(isActiveAdminPath("/users/123", "/users")).toBe(true);
    expect(isActiveAdminPath("/sessions", "/sessions")).toBe(true);
  });

  it("keeps dashboard exact to avoid false positives", () => {
    expect(isActiveAdminPath("/dashboard", "/dashboard")).toBe(true);
    expect(isActiveAdminPath("/dashboard/stats", "/dashboard")).toBe(false);
  });

  it("rejects unrelated sections", () => {
    expect(isActiveAdminPath("/apps", "/users")).toBe(false);
  });
});
