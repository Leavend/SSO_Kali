export function appSessionCookieName(value: string): string {
  if (!value.startsWith("__Host-")) {
    throw new Error("App A session cookies must use the __Host- prefix.");
  }

  return value;
}

export function hostSessionCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: true,
  };
}

export function expiredHostSessionCookieOptions() {
  return {
    ...hostSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };
}
