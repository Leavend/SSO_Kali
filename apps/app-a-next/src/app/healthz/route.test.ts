import { describe, expect, it } from "vitest";

import { GET } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("serves a dependency-free health response", async () => {
    const response = GET();

    await expect(response.text()).resolves.toBe("ok\n");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
