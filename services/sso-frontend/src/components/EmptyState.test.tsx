import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EmptyState from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders icon, message, description, and action node", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        icon="⊛"
        message="No active sessions"
        description="Sessions will appear here once users authenticate via SSO."
        actionNode={<button type="button">Refresh Data</button>}
      />,
    );

    expect(html).toContain("No active sessions");
    expect(html).toContain(
      "Sessions will appear here once users authenticate via SSO.",
    );
    expect(html).toContain("Refresh Data");
  });
});
