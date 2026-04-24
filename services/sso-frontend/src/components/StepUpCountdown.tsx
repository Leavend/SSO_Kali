"use client";

import { useSensitiveCountdown } from "@/lib/use-sensitive-countdown";
import { buildAdminLoginHref } from "@/lib/admin-login-url";

type StepUpCountdownProps = {
  readonly authTime: number | null;
  readonly returnTo: string;
};

/**
 * Warning banner that appears when the step-up authentication window is about
 * to expire (< 60 seconds remaining). Gives the user a heads-up before the
 * ReAuth interstitial appears on sensitive actions.
 */
export default function StepUpCountdown({ authTime, returnTo }: StepUpCountdownProps) {
  const remaining = useSensitiveCountdown(authTime);

  if (remaining === null || remaining > 60) {
    return null;
  }

  if (remaining === 0) {
    return (
      <div className="mb-4 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-warning">
            🔒 Step-up authentication has expired. Sensitive actions will require re-verification.
          </p>
          <a
            className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-warning-hover"
            href={buildAdminLoginHref(returnTo)}
          >
            Re-authenticate Now
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3">
      <p className="text-xs text-warning">
        ⏱ Step-up authentication expires in{" "}
        <span className="font-mono font-bold">{remaining}s</span>.
        Sensitive actions will require re-verification after that.
      </p>
    </div>
  );
}
