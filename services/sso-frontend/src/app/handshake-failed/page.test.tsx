import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HandshakeFailedPage from "@/app/handshake-failed/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("handshake-failed page", () => {
  it("renders recovery actions without requiring server-side cookie mutation", async () => {
    const html = renderToStaticMarkup(await HandshakeFailedPage());

    expect(html).toContain("Secure Handshake Failed");
    expect(html).toContain("Retry Secure Sign-In");
    expect(html).toContain("Clear Session and Retry");
    expect(html).toContain("href=\"/auth/login\"");
    expect(html).toContain("href=\"/auth/logout\"");
  });
});
