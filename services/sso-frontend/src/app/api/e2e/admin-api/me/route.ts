import { NextRequest, NextResponse } from "next/server";
import {
  e2eEnabled,
  e2eNotFound,
  isForbiddenToken,
  mockPrincipalForToken,
  readBearerToken,
} from "@/lib/e2e-admin-flow";

export async function GET(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const token = readBearerToken(request.headers.get("authorization"));
  const principal = mockPrincipalForToken(token);

  if (principal) {
    return NextResponse.json({ principal });
  }

  if (isForbiddenToken(token)) {
    return NextResponse.json({
      error: "forbidden",
      error_description: "Admin role is required to access this resource.",
    }, { status: 403 });
  }

  return NextResponse.json({
    error: "unauthorized",
    error_description: "Bearer token is missing or invalid.",
  }, { status: 401 });
}
