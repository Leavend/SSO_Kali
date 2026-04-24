export const ADMIN_SESSION_COOKIE = "__Secure-admin-session";
export const ADMIN_TX_COOKIE = "__Secure-admin-tx";

export function assertSecureCookieName(name: string): string {
  if (!name.startsWith("__Secure-")) {
    throw new Error("Frontend session cookies must use the __Secure- prefix.");
  }

  return name;
}

export function hostCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "strict" as const,
    secure: true,
  };
}

export function expiredHostCookieOptions() {
  return {
    ...hostCookieOptions(0),
    expires: new Date(0),
  };
}
