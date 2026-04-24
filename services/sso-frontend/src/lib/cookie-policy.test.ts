import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_TX_COOKIE,
  assertSecureCookieName,
  expiredHostCookieOptions,
  hostCookieOptions,
} from "@/lib/cookie-policy";

describe("cookie policy", () => {
  it("keeps admin cookies on the __Secure- prefix", () => {
    expect(assertSecureCookieName(ADMIN_SESSION_COOKIE)).toBe(ADMIN_SESSION_COOKIE);
    expect(assertSecureCookieName(ADMIN_TX_COOKIE)).toBe(ADMIN_TX_COOKIE);
  });

  it("rejects cookies without the __Secure- prefix", () => {
    expect(() => assertSecureCookieName("bad-name")).toThrow();
    expect(() => assertSecureCookieName("__Host-old")).toThrow();
  });

  it("returns secure cookie options", () => {
    expect(hostCookieOptions(300)).toEqual({
      httpOnly: true,
      maxAge: 300,
      path: "/",
      sameSite: "strict",
      secure: true,
    });
  });

  it("returns expired cookie options for clearing sessions", () => {
    expect(expiredHostCookieOptions().maxAge).toBe(0);
    expect(expiredHostCookieOptions().expires).toEqual(new Date(0));
  });
});
