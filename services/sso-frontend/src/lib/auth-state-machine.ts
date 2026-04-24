import type { AdminSession } from "@/lib/session";

export type AdminAuthState =
  | { readonly status: "anonymous" }
  | { readonly status: "needs_credentials" }
  | { readonly status: "authenticating"; readonly session?: AdminSession }
  | { readonly status: "authorized"; readonly session: AdminSession }
  | { readonly status: "forbidden"; readonly session: AdminSession }
  | { readonly status: "mfa_required"; readonly session: AdminSession }
  | { readonly status: "stale_session"; readonly session: AdminSession };

export type AdminAuthEvent =
  | { readonly type: "ENTRY_VISITED" }
  | { readonly type: "SESSION_DISCOVERED"; readonly session: AdminSession }
  | { readonly type: "AUTH_CALLBACK_STARTED" }
  | { readonly type: "BOOTSTRAP_SUCCEEDED"; readonly session: AdminSession }
  | { readonly type: "BOOTSTRAP_FORBIDDEN"; readonly session: AdminSession }
  | { readonly type: "BOOTSTRAP_MFA_REQUIRED"; readonly session: AdminSession }
  | { readonly type: "BOOTSTRAP_STALE"; readonly session: AdminSession }
  | { readonly type: "RESET" };

export function initialAdminAuthState(): AdminAuthState {
  return { status: "anonymous" };
}

export function transitionAdminAuthState(state: AdminAuthState, event: AdminAuthEvent): AdminAuthState {
  switch (event.type) {
    case "ENTRY_VISITED":
      return state.status === "anonymous" ? { status: "needs_credentials" } : state;
    case "SESSION_DISCOVERED":
      return { status: "authenticating", session: event.session };
    case "AUTH_CALLBACK_STARTED":
      return { status: "authenticating" };
    case "BOOTSTRAP_SUCCEEDED":
      return { status: "authorized", session: event.session };
    case "BOOTSTRAP_FORBIDDEN":
      return { status: "forbidden", session: event.session };
    case "BOOTSTRAP_MFA_REQUIRED":
      return { status: "mfa_required", session: event.session };
    case "BOOTSTRAP_STALE":
      return { status: "stale_session", session: event.session };
    case "RESET":
      return initialAdminAuthState();
  }
}
