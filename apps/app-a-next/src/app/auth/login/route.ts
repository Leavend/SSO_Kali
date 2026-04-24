import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, createAuthTransaction } from "@/lib/oidc";
import { storeAuthTransaction } from "@/lib/session-store";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const transaction = createAuthTransaction();
  const prompt = request.nextUrl.searchParams.get("prompt") ?? undefined;

  await storeAuthTransaction(transaction.state, {
    codeVerifier: transaction.codeVerifier,
    nonce: transaction.nonce,
  });

  return NextResponse.redirect(buildAuthorizeUrl(transaction, prompt));
}
