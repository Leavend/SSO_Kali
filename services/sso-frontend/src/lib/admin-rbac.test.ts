import { describe, expect, it } from "vitest";
import {
  canManageSessions,
  canViewAdminPanel,
  isAccessDeniedStatus,
} from "@/lib/admin-rbac";

describe("admin RBAC policy", () => {
  it("allows admin users to view the panel and manage sessions", () => {
    expect(canViewAdminPanel("admin")).toBe(true);
    expect(canManageSessions("admin")).toBe(true);
  });

  it("denies non-admin roles", () => {
    expect(canViewAdminPanel("viewer")).toBe(false);
    expect(canManageSessions("viewer")).toBe(false);
  });

  it("treats 401 and 403 as access denied states", () => {
    expect(isAccessDeniedStatus(401)).toBe(true);
    expect(isAccessDeniedStatus(403)).toBe(true);
    expect(isAccessDeniedStatus(500)).toBe(false);
  });
});
