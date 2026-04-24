import type { NextRequest } from "next/server";
import { redirectToIdentityUi } from "@/lib/identity-ui";

export function GET(request: NextRequest) {
  return redirectToIdentityUi(request, "password/reset");
}
