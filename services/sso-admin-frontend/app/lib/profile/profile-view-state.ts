import type { StatusTone } from '@/lib/status-tone'
import type { AdminAuthContext, AdminPrincipal } from '@/types/auth.types'

export type ProfileViewState = 'loading' | 'ready'

// The principal lives in the shared session store (hydrated useState); the admin
// guard owns the unauthenticated/forbidden redirects, so the page only models
// "principal not yet resolved" (loading) vs "resolved" (ready).
export function resolveProfileViewState({
  principal,
}: {
  readonly principal: AdminPrincipal | null
}): ProfileViewState {
  return principal ? 'ready' : 'loading'
}

// MFA posture: verified -> success; enforced but not yet verified -> warning;
// not enforced -> neutral. danger is reserved for destructive affordances — an
// unverified-but-enforced MFA is a warning, not a destructive state.
export function resolveMfaTone(authContext: AdminAuthContext): StatusTone {
  if (authContext.mfa_verified) return 'success'
  if (authContext.mfa_enforced) return 'warning'
  return 'neutral'
}
