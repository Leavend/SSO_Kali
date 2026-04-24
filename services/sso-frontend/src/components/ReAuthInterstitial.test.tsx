import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReAuthInterstitial from "@/components/ReAuthInterstitial";

describe("ReAuthInterstitial", () => {
  it("renders a verify link back into the hosted login flow", () => {
    const html = renderToStaticMarkup(
      <ReAuthInterstitial
        open
        returnTo="/sessions"
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Re-authentication Required");
    expect(html).toContain("/auth/login?return_to=%2Fsessions");
    expect(html).toContain("Verify Identity Again");
    expect(html).toContain("href=\"/auth/login?return_to=%2Fsessions\"");
  });

  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(
      <ReAuthInterstitial
        open={false}
        returnTo="/sessions"
        onClose={() => undefined}
      />,
    )).toBe("");
  });
});
