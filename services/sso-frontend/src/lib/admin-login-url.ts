export function buildAdminLoginHref(returnTo?: string): string {
  const safeReturnTo = normalizeReturnTo(returnTo);

  if (!safeReturnTo) {
    return "/auth/login";
  }

  return `/auth/login?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function normalizeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  if (isAuthLoopPath(returnTo)) {
    return null;
  }

  return returnTo;
}

function isAuthLoopPath(pathname: string): boolean {
  return pathname.startsWith("/auth/login") || pathname.startsWith("/auth/callback");
}
