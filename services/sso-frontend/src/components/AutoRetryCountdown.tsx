"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type AutoRetryCountdownProps = {
  readonly redirectTo: string;
  readonly seconds?: number;
  readonly label?: string;
};

export default function AutoRetryCountdown({
  redirectTo,
  seconds = 10,
  label = "Auto-redirect dalam",
}: AutoRetryCountdownProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);

  const cancel = useCallback(() => setCancelled(true), []);

  useEffect(() => {
    if (cancelled || remaining <= 0) return;

    const timer = setTimeout(() => {
      setRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [remaining, cancelled]);

  useEffect(() => {
    if (remaining <= 0 && !cancelled) {
      router.push(redirectTo);
    }
  }, [remaining, cancelled, redirectTo, router]);

  if (cancelled) {
    return (
      <p className="mt-6 text-center text-xs text-muted">
        Auto-redirect dibatalkan.{" "}
        <a href={redirectTo} className="text-accent underline underline-offset-2 hover:text-accent-hover">
          Redirect manual →
        </a>
      </p>
    );
  }

  const progress = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="mt-6 flex flex-col items-center gap-3" role="timer" aria-live="polite">
      {/* Circular progress ring */}
      <div className="relative flex size-16 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-line"
          />
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 28}`}
            strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
            strokeLinecap="round"
            className="text-accent transition-all duration-1000 ease-linear"
          />
        </svg>
        <span className="text-lg font-bold tabular-nums text-ink">
          {remaining}
        </span>
      </div>
      <p className="text-xs text-muted">{label} {remaining}s...</p>
      <button
        type="button"
        onClick={cancel}
        className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:bg-card-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        Batalkan
      </button>
    </div>
  );
}
