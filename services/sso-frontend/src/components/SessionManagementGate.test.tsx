import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionManagementGate from "@/components/SessionManagementGate";

describe("SessionManagementGate", () => {
  it("renders destructive actions for authorized roles", () => {
    const html = renderToStaticMarkup(
      <SessionManagementGate allowed>
        <button type="button">Revoke</button>
      </SessionManagementGate>,
    );

    expect(html).toContain("Revoke");
  });

  it("hides destructive actions for unauthorized roles", () => {
    const html = renderToStaticMarkup(
      <SessionManagementGate
        allowed={false}
        fallback={<span>Restricted</span>}
      >
        <button type="button">Revoke</button>
      </SessionManagementGate>,
    );

    expect(html).toContain("Restricted");
    expect(html).not.toContain("Revoke");
  });
});
