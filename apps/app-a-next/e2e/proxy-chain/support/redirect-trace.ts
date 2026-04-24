import type { Page, Request } from "@playwright/test";

export type RedirectTraceEntry = {
  readonly isNavigationRequest: boolean;
  readonly method: string;
  readonly resourceType: string;
  readonly url: string;
};

export function attachRedirectTrace(page: Page): () => RedirectTraceEntry[] {
  const entries: RedirectTraceEntry[] = [];
  const handler = (request: Request) => pushTraceEntry(entries, request);

  page.on("request", handler);

  return () => {
    page.off("request", handler);

    return entries;
  };
}

export function hasTraceUrl(
  entries: readonly RedirectTraceEntry[],
  prefix: string,
): boolean {
  return entries.some((entry) => entry.url.startsWith(prefix));
}

function pushTraceEntry(
  entries: RedirectTraceEntry[],
  request: Request,
): void {
  if (!shouldTrack(request)) {
    return;
  }

  entries.push({
    isNavigationRequest: request.isNavigationRequest(),
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  });
}

function shouldTrack(request: Request): boolean {
  return request.isNavigationRequest() || request.resourceType() === "document";
}
