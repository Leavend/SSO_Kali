import { describe, expect, it } from "vitest";
import { buildAdminApiError, toErrorMessage } from "@/lib/admin-api-error";

describe("admin-api-error", () => {
  it("prefers structured JSON messages", async () => {
    const response = new Response(
      JSON.stringify({ error: "reauth_required", message: "Token expired." }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );

    const error = await buildAdminApiError(response);

    expect(error.message).toBe("Token expired.");
    expect(error.status).toBe(401);
    expect(error.code).toBe("reauth_required");
  });

  it("falls back to friendly messages for empty bodies", async () => {
    const response = new Response("", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });

    const error = await buildAdminApiError(response);

    expect(error.message).toBe(
      "The admin API is temporarily unavailable. Please try again.",
    );
  });

  it("extracts messages from unknown errors safely", () => {
    expect(toErrorMessage(new Error("Boom"), "Fallback")).toBe("Boom");
    expect(toErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});
