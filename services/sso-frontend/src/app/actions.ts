"use server";

import { revalidatePath } from "next/cache";
import {
  AdminApiError,
  isMfaRequiredApiError,
  isReauthRequiredApiError,
  isTooManyAttemptsApiError,
} from "@/lib/admin-api-error";
import { canManageSessions, isAccessDeniedStatus } from "@/lib/admin-rbac";
import { getSession } from "@/lib/session";
import { revokeSession, revokeUserSessions } from "@/lib/admin-api";
import { recordForbiddenAttempt } from "@/lib/rbac-telemetry";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 128;

export type AdminActionResult = {
  readonly ok: boolean;
  readonly error?: string;
  readonly code?: "forbidden" | "mfa_required" | "reauth_required" | "too_many_attempts";
};

// ─── Public Actions ────────────────────────────────────────

export async function revokeSessionAction(
  sessionId: string,
): Promise<AdminActionResult> {
  return executeSensitiveAction("revoke_session", sessionId, "sessionId", revokeSession);
}

export async function revokeAllUserSessionsAction(
  subjectId: string,
): Promise<AdminActionResult> {
  return executeSensitiveAction("revoke_user_sessions", subjectId, "subjectId", revokeUserSessions);
}

// ─── Core Pipeline ─────────────────────────────────────────

type ApiMutator = (session: SessionRef, id: string) => Promise<void>;
type SessionRef = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function executeSensitiveAction(
  reason: string,
  rawId: string,
  idLabel: string,
  mutate: ApiMutator,
): Promise<AdminActionResult> {
  const session = await getSession();
  if (!session) return notAuthenticated();

  if (!canManageSessions(session.role)) {
    return forbidden(reason, session);
  }

  const safeId = safeValidateId(rawId);
  if (!safeId) return invalidId(idLabel);

  return callApiAndHandle(mutate, session, safeId, reason);
}

async function callApiAndHandle(
  mutate: ApiMutator,
  session: SessionRef,
  safeId: string,
  reason: string,
): Promise<AdminActionResult> {
  try {
    await mutate(session, safeId);
    revalidateAdminViews();
    return { ok: true };
  } catch (error) {
    return mapApiError(error, reason, session);
  }
}

// ─── Validation ────────────────────────────────────────────

function safeValidateId(id: string): string | null {
  if (!id || id.length > MAX_ID_LENGTH || !SAFE_ID_PATTERN.test(id)) {
    return null;
  }
  return id;
}

// ─── Result Builders ───────────────────────────────────────

function notAuthenticated(): AdminActionResult {
  return { ok: false, error: "Not authenticated" };
}

function invalidId(label: string): AdminActionResult {
  return { ok: false, error: `Invalid ${label} format` };
}

function forbidden(reason: string, session: SessionRef, status?: number): AdminActionResult {
  recordForbiddenAttempt({
    pathname: "/actions",
    reason,
    role: session.role,
    subjectId: session.sub,
    ...(typeof status === "number" ? { status } : {}),
  });

  return {
    ok: false,
    code: "forbidden",
    error: "Access denied. Session management requires an admin role.",
  };
}

function reauthRequired(): AdminActionResult {
  return {
    ok: false,
    code: "reauth_required",
    error: "Re-authentication required. Verify your identity again to continue.",
  };
}

function mfaRequired(): AdminActionResult {
  return {
    ok: false,
    code: "mfa_required",
    error: "Additional verification is required. Continue secure sign-in to complete the extra factor.",
  };
}

function tooManyAttempts(): AdminActionResult {
  return {
    ok: false,
    code: "too_many_attempts",
    error: "Too many attempts were detected. Wait a moment before trying again.",
  };
}

// ─── Error Mapping ─────────────────────────────────────────

function mapApiError(error: unknown, reason: string, session: SessionRef): AdminActionResult {
  if (isReauthRequiredApiError(error)) return reauthRequired();
  if (isMfaRequiredApiError(error)) return mfaRequired();
  if (isTooManyAttemptsApiError(error)) return tooManyAttempts();
  if (isForbiddenApiError(error)) return forbidden(reason, session, error.status);
  return { ok: false, error: "Failed to complete the operation" };
}

function isForbiddenApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && isAccessDeniedStatus(error.status);
}

// ─── Side Effects ──────────────────────────────────────────

function revalidateAdminViews(): void {
  revalidatePath("/sessions");
  revalidatePath("/users", "layout");
  revalidatePath("/dashboard");
}
