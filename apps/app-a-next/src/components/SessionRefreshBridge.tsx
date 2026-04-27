"use client";

import { useEffect } from "react";
import { requestSessionRefresh, subscribeAuthSession } from "@/lib/authenticated-fetch";

type SessionRefreshBridgeProps = {
  readonly authenticated: boolean;
};

const refreshIntervalMs = 60_000;

export function SessionRefreshBridge({ authenticated }: SessionRefreshBridgeProps) {
  useEffect(() => {
    if (!authenticated) return undefined;

    const unsubscribe = subscribeAuthSession(handleSessionMessage);
    const intervalId = window.setInterval(refreshQuietly, refreshIntervalMs);

    window.addEventListener("focus", refreshQuietly);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    refreshQuietly();

    return () => cleanup(intervalId, unsubscribe);
  }, [authenticated]);

  return null;
}

function refreshWhenVisible(): void {
  if (document.visibilityState === "visible") refreshQuietly();
}

function refreshQuietly(): void {
  void requestSessionRefresh();
}

function handleSessionMessage(message: { readonly type: string }): void {
  if (message.type === "expired") window.location.assign("/?event=session-expired");
}

function cleanup(intervalId: number, unsubscribe: () => void): void {
  window.clearInterval(intervalId);
  window.removeEventListener("focus", refreshQuietly);
  document.removeEventListener("visibilitychange", refreshWhenVisible);
  unsubscribe();
}
