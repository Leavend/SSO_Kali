import { NextRequest, NextResponse } from "next/server";
import { destroySessionsBySid } from "@/lib/session-store";
import { verifyLogoutToken } from "@/lib/logout-token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const rawToken = formData.get("logout_token");

  if (typeof rawToken !== "string" || rawToken === "") {
    return NextResponse.json({ error: "logout_token is required" }, { status: 400 });
  }

  try {
    const claims = await verifyLogoutToken(rawToken);
    if (claims.sid === "") {
      return NextResponse.json({ error: "logout sid is required" }, { status: 401 });
    }
    const cleared = await destroySessionsBySid(claims.sid);

    return NextResponse.json({ cleared, sid: claims.sid });
  } catch {
    return NextResponse.json({ error: "invalid logout token" }, { status: 401 });
  }
}
