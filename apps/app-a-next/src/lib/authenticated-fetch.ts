"use client";

export type AuthSessionMessage = {
  readonly expiresAt?: number;
  readonly type: "expired" | "refreshed";
};

type AuthSessionListener = (message: AuthSessionMessage) => void;

const channelName = "app-a-auth-session";
let refreshInFlight: Promise<boolean> | null = null;

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const firstResponse = await fetch(input, withCredentials(init));

  if (firstResponse.status !== 401) return firstResponse;

  const refreshed = await requestSessionRefresh();

  return refreshed ? fetch(input, withCredentials(init)) : firstResponse;
}

export function requestSessionRefresh(): Promise<boolean> {
  refreshInFlight ??= refreshSession();

  return refreshInFlight.finally(() => {
    refreshInFlight = null;
  });
}

export function subscribeAuthSession(listener: AuthSessionListener): () => void {
  const channel = openChannel();

  if (channel === null) return () => undefined;

  channel.onmessage = (event: MessageEvent<AuthSessionMessage>) => listener(event.data);

  return () => channel.close();
}

async function refreshSession(): Promise<boolean> {
  const response = await fetch("/auth/refresh", {
    cache: "no-store",
    credentials: "include",
    method: "POST",
  });

  if (!response.ok) return notifyExpired();

  notify(await response.json() as AuthSessionMessage);

  return true;
}

function withCredentials(init: RequestInit): RequestInit {
  return { ...init, credentials: "include" };
}

function notifyExpired(): false {
  notify({ type: "expired" });

  return false;
}

function notify(message: AuthSessionMessage): void {
  const channel = openChannel();

  if (channel === null) return;

  channel.postMessage(message);
  channel.close();
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
}
