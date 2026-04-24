"use client";

import { useEffect, useState } from "react";

const SENSITIVE_ACTION_WINDOW_SECONDS = 5 * 60;

/**
 * Returns the number of seconds remaining before the step-up authentication
 * window expires. Returns `null` if authTime is unknown, or `0` once expired.
 *
 * Only counts down below the warning threshold (60 seconds) to avoid
 * unnecessary re-renders.
 */
export function useSensitiveCountdown(authTime: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    () => computeRemaining(authTime),
  );

  useEffect(() => {
    if (authTime === null) return;

    const id = setInterval(() => {
      const left = computeRemaining(authTime);
      setRemaining(left);
      if (left !== null && left <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [authTime]);

  return remaining;
}

function computeRemaining(authTime: number | null): number | null {
  if (authTime === null) return null;

  const age = Math.floor(Date.now() / 1000) - authTime;
  const left = SENSITIVE_ACTION_WINDOW_SECONDS - age;

  return Math.max(0, left);
}
