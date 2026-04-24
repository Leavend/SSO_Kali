import { NextRequest, NextResponse } from "next/server";
import { e2eEnabled, e2eNotFound } from "@/lib/e2e-admin-flow";

export async function GET(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const destination = new URL("/api/e2e/mock-sso/authorize", request.nextUrl.origin);

  request.nextUrl.searchParams.forEach((value, key) => {
    destination.searchParams.set(key, value);
  });

  if (request.nextUrl.searchParams.get("client_id") === "sso-admin-panel") {
    destination.searchParams.set("prompt", "login");
    destination.searchParams.set("max_age", "0");
  }

  return NextResponse.redirect(destination);
}
