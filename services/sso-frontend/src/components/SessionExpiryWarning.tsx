"use client";

import { useSessionExpiry } from "@/lib/use-session-expiry";

type SessionExpiryWarningProps = {
  readonly expiresAt: number | null;
};

const WARNING_THRESHOLD_SECONDS = 120;

/**
 * Displays a warning banner when the session is about to expire.
 * Shows at < 2 minutes remaining with a live countdown.
 */
export default function SessionExpiryWarning({ expiresAt }: SessionExpiryWarningProps) {
  const remaining = useSessionExpiry(expiresAt);

  if (remaining === null || remaining > WARNING_THRESHOLD_SECONDS) {
    return null;
  }

  if (remaining === 0) {
    return <ExpiredBanner />;
  }

  return <CountdownBanner remaining={remaining} />;
}

function ExpiredBanner() {
  return (
    <div className="mb-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-danger">
          🔒 Your session has expired. Please sign in again to continue.
        </p>
        <a
          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-hover"
          href="/auth/login"
        >
          Sign In Again
        </a>
      </div>
    </div>
  );
}

function CountdownBanner({ remaining }: { readonly remaining: number }) {
  return (
    <div className="mb-4 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-warning">
          ⏱ Your session expires in{" "}
          <span className="font-mono font-bold">{formatCountdown(remaining)}</span>.
          Save your work and re-authenticate.
        </p>
        <a
          className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-warning-hover"
          href="/auth/login"
        >
          Renew Session
        </a>
      </div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
