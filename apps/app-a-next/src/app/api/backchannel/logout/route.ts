import { NextRequest, NextResponse } from "next/server";
import { destroySessionsBySid, destroySessionsBySubject } from "@/lib/session-store";
import { verifyLogoutToken } from "@/lib/logout-token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const rawToken = formData.get("logout_token");

  if (typeof rawToken !== "string" || rawToken === "") {
    return NextResponse.json({ error: "logout_token is required" }, { status: 400 });
  }

  try {
    const claims = await verifyLogoutToken(rawToken);
    const cleared = await clearSessions(claims.sid, claims.sub);

    return NextResponse.json({ cleared, sid: claims.sid, sub: claims.sub });
  } catch {
    return NextResponse.json({ error: "invalid logout token" }, { status: 401 });
  }
}

async function clearSessions(sid: string, subject: string | null): Promise<number> {
  if (sid === "" && subject === null) throw new Error("Missing logout target.");

  const bySid = sid === "" ? 0 : await destroySessionsBySid(sid);
  const bySubject = subject === null ? 0 : await destroySessionsBySubject(subject);

  return bySid + bySubject;
}
