import type { AdminSession } from '@/types/sessions.types'

// Client-side search over the hydrated active-session list (the backend GET has no
// query params). Matches the fields an operator can see: session id, client, name,
// email, IP. An empty/whitespace query returns the input array unchanged (same ref).
export function filterSessions(
  sessions: readonly AdminSession[],
  query: string,
): readonly AdminSession[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return sessions
  return sessions.filter((session) =>
    [
      session.session_id,
      session.client_id,
      session.display_name,
      session.email,
      session.ip_address,
    ].some((field) => field != null && field.toLowerCase().includes(needle)),
  )
}

// Self-lockout detection: the backend offers no `is_current` flag and no
// self-protection, so the UI flags a session as the acting admin's own when its
// subject_id equals the principal's. Terminating such a session can sign the admin
// out, so the confirm warns and the page re-verifies the principal afterward.
export function isOwnSession(
  session: AdminSession,
  principalSubjectId: string | null | undefined,
): boolean {
  return (
    principalSubjectId != null &&
    session.subject_id != null &&
    session.subject_id === principalSubjectId
  )
}
