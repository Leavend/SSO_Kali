import { NextRequest } from "next/server";
import {
  clearSessionCookieResponse,
  e2eEnabled,
  e2eNotFound,
  scenarioFromRequest,
  sessionCookieResponse,
} from "@/lib/e2e-admin-flow";

export async function GET(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const scenario = scenarioFromRequest(request.nextUrl.searchParams.get("scenario"));

  if (!scenario) {
    return Response.json({ error: "invalid_scenario" }, { status: 400 });
  }

  return sessionCookieResponse(scenario);
}

export async function POST(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const body = (await request.json()) as { scenario?: string };
  const scenario = scenarioFromRequest(body.scenario);

  if (!scenario) {
    return Response.json({ error: "invalid_scenario" }, { status: 400 });
  }

  return sessionCookieResponse(scenario);
}

export async function DELETE() {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  return clearSessionCookieResponse();
}
