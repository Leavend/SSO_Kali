import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AuthStatusPage from "@/components/AuthStatusPage";

describe("AuthStatusPage", () => {
  it("renders the primary and secondary recovery actions", () => {
    const html = renderToStaticMarkup(
      <AuthStatusPage
        badge="403"
        title="Access Denied"
        description="Your role is not allowed."
        accent="danger"
        primaryAction={{
          href: "/",
          label: "Back to Sign In",
        }}
        secondaryAction={{
          href: "/auth/logout",
          label: "Sign Out Safely",
        }}
      />,
    );

    expect(html).toContain("Access Denied");
    expect(html).toContain("Back to Sign In");
    expect(html).toContain("Sign Out Safely");
    expect(html).toContain("href=\"/auth/logout\"");
    expect(html).toContain("href=\"/\"");
  });
});
