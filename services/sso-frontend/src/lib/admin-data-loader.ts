import { toErrorMessage } from "@/lib/admin-api-error";
import { redirectOnAccessDenied } from "@/lib/redirect-on-access-denied";
import type { AdminSession } from "@/lib/session";

export type AdminDataResult<T> = {
  readonly data: T | null;
  readonly error: string | null;
};

const DEFAULT_MESSAGE = "The admin API returned an error. Please try refreshing the page.";

export async function loadAdminData<T>(
  session: AdminSession,
  pathname: string,
  loader: (session: AdminSession) => Promise<T>,
  fallbackMessage = DEFAULT_MESSAGE,
): Promise<AdminDataResult<T>> {
  try {
    return { data: await loader(session), error: null };
  } catch (error) {
    return handleLoadError(error, pathname, session, fallbackMessage);
  }
}

function handleLoadError<T>(
  error: unknown,
  pathname: string,
  session: AdminSession,
  fallbackMessage: string,
): AdminDataResult<T> {
  redirectOnAccessDenied(error, { pathname, reason: "admin_api_denied", session });
  return { data: null, error: toErrorMessage(error, fallbackMessage) };
}
