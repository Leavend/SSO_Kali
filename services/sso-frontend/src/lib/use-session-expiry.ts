"use client";

import { useEffect, useState } from "react";

/**
 * Returns the number of seconds remaining before the session expires.
 * Returns `null` if expiresAt is unknown/invalid, `0` once expired.
 */
export function useSessionExpiry(expiresAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    () => computeRemaining(expiresAt),
  );

  useEffect(() => {
    if (expiresAt === null) return;

    const id = setInterval(() => {
      const left = computeRemaining(expiresAt);
      setRemaining(left);
      if (left !== null && left <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function computeRemaining(expiresAt: number | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}
