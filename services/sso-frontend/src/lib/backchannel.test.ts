import { describe, expect, it } from "vitest";
import { getBackchannelDisplay } from "./backchannel";

describe("getBackchannelDisplay", () => {
  it("marks internal endpoints without exposing their URI", () => {
    const result = getBackchannelDisplay({
      client_id: "prototype-app-a",
      type: "public",
      redirect_uris: ["https://app-a.timeh.my.id/auth/callback"],
      backchannel_logout_uri: null,
      backchannel_logout_internal: true,
    });

    expect(result).toEqual({
      label: "Internal endpoint configured",
      tone: "internal",
      title: "Back-channel logout is enabled on an internal service endpoint.",
    });
  });

  it("shows public endpoints verbatim", () => {
    const result = getBackchannelDisplay({
      client_id: "prototype-app-b",
      type: "confidential",
      redirect_uris: ["https://app-b.timeh.my.id/auth/callback"],
      backchannel_logout_uri: "https://bcl.timeh.my.id/backchannel/logout",
      backchannel_logout_internal: false,
    });

    expect(result).toEqual({
      label: "https://bcl.timeh.my.id/backchannel/logout",
      tone: "public",
      title: "https://bcl.timeh.my.id/backchannel/logout",
    });
  });
});
