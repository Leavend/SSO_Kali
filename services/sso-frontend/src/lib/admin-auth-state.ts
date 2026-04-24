import { isAdminApiError, isMfaRequiredApiError, isReauthRequiredApiError } from "@/lib/admin-api-error";
import { fetchPrincipal } from "@/lib/admin-api";
import { canViewAdminPanel } from "@/lib/admin-rbac";
import { requiresAdminSessionReauth } from "@/lib/admin-freshness";
import {
  initialAdminAuthState,
  transitionAdminAuthState,
  type AdminAuthState,
} from "@/lib/auth-state-machine";
import { getSession, sessionFromBootstrap } from "@/lib/session";

type StoredSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function resolveAdminAuthState(): Promise<AdminAuthState> {
  const session = await getSession();
  let state = initialAdminAuthState();

  if (!session) {
    return transitionAdminAuthState(state, { type: "ENTRY_VISITED" });
  }

  state = transitionAdminAuthState(state, { type: "SESSION_DISCOVERED", session });

  if (isBootstrappedSession(session)) {
    return stateFromStoredSession(state, session);
  }

  return bootstrapFromApi(state, session);
}

async function bootstrapFromApi(
  state: AdminAuthState,
  session: StoredSession,
): Promise<AdminAuthState> {
  try {
    const principal = await fetchPrincipal(session);

    return transitionAdminAuthState(state, {
      type: "BOOTSTRAP_SUCCEEDED",
      session: sessionFromBootstrap({
        accessToken: session.accessToken,
        idToken: session.idToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      }, principal),
    });
  } catch (error) {
    return stateFromBootstrapError(state, session, error);
  }
}

function stateFromStoredSession(
  state: AdminAuthState,
  session: StoredSession,
): AdminAuthState {
  if (!canAccessAdminPanel(session)) {
    return transitionAdminAuthState(state, { type: "BOOTSTRAP_FORBIDDEN", session });
  }

  if (requiresAdminSessionReauth(session.authTime)) {
    return transitionAdminAuthState(state, { type: "BOOTSTRAP_STALE", session });
  }

  return transitionAdminAuthState(state, { type: "BOOTSTRAP_SUCCEEDED", session });
}



function stateFromBootstrapError(state: AdminAuthState, session: StoredSession, error: unknown): AdminAuthState {
  if (!isAdminApiError(error)) throw error;

  if (isReauthRequiredApiError(error)) {
    return transitionAdminAuthState(state, { type: "BOOTSTRAP_STALE", session });
  }

  // MFA-specific 403 must be checked before the generic 403 catch-all,
  // otherwise MFA errors are misrouted to /access-denied.
  if (isMfaRequiredApiError(error)) {
    return transitionAdminAuthState(state, { type: "BOOTSTRAP_MFA_REQUIRED", session });
  }

  if (error.status === 403 || error.code === "forbidden") {
    return transitionAdminAuthState(state, { type: "BOOTSTRAP_FORBIDDEN", session });
  }

  if (error.status === 401) {
    return transitionAdminAuthState(initialAdminAuthState(), { type: "ENTRY_VISITED" });
  }

  throw error;
}

function canAccessAdminPanel(
  session: StoredSession,
): boolean {
  return canViewAdminPanel(session.role) && session.permissions.view_admin_panel;
}

function isBootstrappedSession(
  session: StoredSession,
): boolean {
  return hasKnownAuthTime(session.authTime)
    && hasPermissions(session.permissions)
    && Array.isArray(session.amr)
    && hasKnownAcr(session.acr);
}

function hasKnownAuthTime(authTime: unknown): authTime is number | null {
  return typeof authTime === "number" || authTime === null;
}

function hasKnownAcr(acr: unknown): acr is string | null {
  return typeof acr === "string" || acr === null;
}

function hasPermissions(value: unknown): value is {
  readonly view_admin_panel: boolean;
  readonly manage_sessions: boolean;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const permissions = value as Record<string, unknown>;

  return typeof permissions.view_admin_panel === "boolean"
    && typeof permissions.manage_sessions === "boolean";
}
