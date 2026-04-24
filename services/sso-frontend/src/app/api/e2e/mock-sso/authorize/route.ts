import { NextRequest, NextResponse } from "next/server";
import { e2eEnabled, e2eNotFound } from "@/lib/e2e-admin-flow";

export async function GET(request: NextRequest) {
  if (!e2eEnabled()) {
    return e2eNotFound();
  }

  const prompt = request.nextUrl.searchParams.get("prompt") ?? "";
  const maxAge = request.nextUrl.searchParams.get("max_age") ?? "";
  const hasUpstreamSession = request.cookies.get("mock-idp-session")?.value === "active";

  return new NextResponse(renderHostedLoginHtml({
    prompt,
    maxAge,
    hasUpstreamSession,
  }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    status: 200,
  });
}

function renderHostedLoginHtml(props: {
  readonly prompt: string;
  readonly maxAge: string;
  readonly hasUpstreamSession: boolean;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock Hosted Login</title>
    <style>
      body { font-family: sans-serif; background: #f8fafc; color: #0f172a; margin: 0; }
      main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      section { max-width: 540px; background: white; border: 1px solid #cbd5e1; border-radius: 24px; padding: 32px; box-shadow: 0 24px 64px rgba(15, 23, 42, 0.12); }
      .badge { display: inline-flex; padding: 10px 14px; border-radius: 14px; background: #dbeafe; color: #0369a1; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; font-size: 12px; }
      dl { margin-top: 20px; display: grid; gap: 12px; }
      dt { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
      dd { margin: 4px 0 0; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="badge">Hosted Login</div>
        <h1>Credential Step Required</h1>
        <p>This mock identity provider confirms that <code>dev-sso</code> forces interactive re-authentication.</p>
        <dl>
          <div>
            <dt>Active upstream session</dt>
            <dd data-testid="upstream-session-value">${props.hasUpstreamSession ? "Detected" : "Not detected"}</dd>
          </div>
          <div>
            <dt>prompt</dt>
            <dd data-testid="prompt-value">${props.prompt || "missing"}</dd>
          </div>
          <div>
            <dt>max_age</dt>
            <dd data-testid="max-age-value">${props.maxAge || "missing"}</dd>
          </div>
        </dl>
      </section>
    </main>
  </body>
</html>`;
}
