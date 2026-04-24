type ForbiddenAttempt = {
  readonly pathname: string;
  readonly reason: string;
  readonly role?: string;
  readonly status?: number;
  readonly subjectId?: string;
};

export function recordForbiddenAttempt(event: ForbiddenAttempt): void {
  const payload = JSON.stringify({
    ...event,
    at: new Date().toISOString(),
  });

  console.warn(`[ADMIN_RBAC_FORBIDDEN] ${payload}`);
}
