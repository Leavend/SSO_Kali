import { NextRequest, NextResponse } from "next/server";
import {
  e2eEnabled,
  e2eNotFound,
  mockPrincipalForToken,
  mockSessions,
  readBearerToken,
} from "@/lib/e2e-admin-flow";

export async function GET(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const token = readBearerToken(request.headers.get("authorization"));
  const principal = mockPrincipalForToken(token);

  if (!principal) {
    return NextResponse.json({
      error: "unauthorized",
      error_description: "Bearer token is missing or invalid.",
    }, { status: 401 });
  }

  return NextResponse.json({ sessions: mockSessions() });
}
