import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";

describe("root loading screen", () => {
  it("renders an auth-neutral loading experience", () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toContain("Preparing Secure Admin Sign-In");
    expect(html).toContain("Checking the current admin session");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("Users");
    expect(html).not.toContain("Sessions");
  });
});
