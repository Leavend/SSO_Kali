import { getConfig } from "./config";
import { buildAdminApiError } from "./admin-api-error";
import type { AdminPrincipal } from "./admin-principal";
import type { AdminSession } from "./session";

export type ApiUser = {
  id: number;
  subject_id: string;
  email: string;
  display_name: string;
  role: string;
  last_login_at: string | null;
  created_at: string;
  login_context: {
    ip_address: string | null;
    risk_score: number;
    mfa_required: boolean;
    last_seen_at: string | null;
  } | null;
};

export type ApiSession = {
  session_id: string;
  client_id: string;
  subject_id: string;
  email: string;
  display_name: string;
  scope: string;
  created_at: string;
  expires_at: string;
};

export type ApiClient = {
  client_id: string;
  type: string;
  redirect_uris: string[];
  backchannel_logout_uri: string | null;
  backchannel_logout_internal: boolean;
};

type AccessToken = string;

async function adminFetch<T>(path: string, session: AdminSession, init?: RequestInit): Promise<T> {
  return adminFetchWithToken(path, session.accessToken, init);
}

async function adminFetchWithToken<T>(path: string, accessToken: AccessToken, init?: RequestInit): Promise<T> {
  const config = getConfig();
  const res = await fetch(`${config.adminApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw await buildAdminApiError(res);
  }

  return res.json() as Promise<T>;
}

export async function fetchUsers(session: AdminSession): Promise<ApiUser[]> {
  const data = await adminFetch<{ users: ApiUser[] }>("/users", session);
  return data.users;
}

export async function fetchPrincipal(session: AdminSession): Promise<AdminPrincipal> {
  return fetchPrincipalWithAccessToken(session.accessToken);
}

export async function fetchPrincipalWithAccessToken(accessToken: string): Promise<AdminPrincipal> {
  const data = await adminFetchWithToken<{ principal: AdminPrincipal }>("/me", accessToken);
  return data.principal;
}

export async function fetchUser(session: AdminSession, subjectId: string): Promise<{
  user: ApiUser;
  sessions: ApiSession[];
}> {
  return adminFetch(`/users/${subjectId}`, session);
}

export async function fetchSessions(session: AdminSession): Promise<ApiSession[]> {
  const data = await adminFetch<{ sessions: ApiSession[] }>("/sessions", session);
  return data.sessions;
}

export async function fetchClients(session: AdminSession): Promise<ApiClient[]> {
  const data = await adminFetch<{ clients: ApiClient[] }>("/clients", session);
  return data.clients;
}

export async function revokeSession(session: AdminSession, sessionId: string): Promise<void> {
  await adminFetch(`/sessions/${sessionId}`, session, { method: "DELETE" });
}

export async function revokeUserSessions(session: AdminSession, subjectId: string): Promise<void> {
  await adminFetch(`/users/${subjectId}/sessions`, session, { method: "DELETE" });
}
