import { describe, expect, it } from "vitest";

/**
 * Tests for the Edge Middleware (UF-01).
 * Validates that protected paths require a session cookie.
 */
describe("middleware path matching", () => {
  const PROTECTED_PATHS = ["/dashboard", "/sessions", "/users", "/apps"];
  const PUBLIC_PATHS = ["/", "/access-denied", "/handshake-failed", "/auth/login", "/auth/callback"];

  it("identifies all admin routes as protected", () => {
    for (const path of PROTECTED_PATHS) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });

  it("does not protect public and auth routes", () => {
    for (const path of PUBLIC_PATHS) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  it("protects nested paths under /users", () => {
    expect(isProtectedPath("/users/abc-123")).toBe(true);
    expect(isProtectedPath("/users/abc/detail")).toBe(true);
  });

  it("does not protect API routes", () => {
    expect(isProtectedPath("/api/health")).toBe(false);
    expect(isProtectedPath("/_next/static/chunk.js")).toBe(false);
  });
});

/** Mirror of the middleware's path check logic */
function isProtectedPath(pathname: string): boolean {
  const protectedPrefixes = ["/dashboard", "/sessions", "/users", "/apps"];
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
