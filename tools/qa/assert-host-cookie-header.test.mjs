import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSetCookieHeader,
  validateHostCookieCompliance,
} from "./assert-host-cookie-header.mjs";

test("accepts a valid __Host- cookie", () => {
  const cookie = parseSetCookieHeader(
    "__Host-app-a-session=session-123; Path=/; Secure; HttpOnly; SameSite=Lax",
  );

  const issues = validateHostCookieCompliance(cookie, {
    expectedName: "__Host-app-a-session",
  });

  assert.deepEqual(issues, []);
});

test("rejects a cookie with Domain attribute", () => {
  const cookie = parseSetCookieHeader(
    "__Host-app-a-session=session-123; Path=/; Domain=example.com; Secure; HttpOnly; SameSite=Lax",
  );

  const issues = validateHostCookieCompliance(cookie, {
    expectedName: "__Host-app-a-session",
  });

  assert.ok(issues.includes("Domain attribute must be omitted"));
});

test("rejects a cookie without Secure", () => {
  const cookie = parseSetCookieHeader(
    "__Host-app-a-session=session-123; Path=/; HttpOnly; SameSite=Lax",
  );

  const issues = validateHostCookieCompliance(cookie, {
    expectedName: "__Host-app-a-session",
  });

  assert.ok(issues.includes("Secure attribute is required"));
});

test("requires expired cookies when requested", () => {
  const cookie = parseSetCookieHeader(
    "__Host-app-a-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  );

  const issues = validateHostCookieCompliance(cookie, {
    expectExpired: true,
    expectedName: "__Host-app-a-session",
  });

  assert.deepEqual(issues, []);
});
