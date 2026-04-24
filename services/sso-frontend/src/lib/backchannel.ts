import type { ApiClient } from "./admin-api";

export type BackchannelDisplay = {
  label: string;
  title?: string;
  tone: "disabled" | "internal" | "public";
};

export function getBackchannelDisplay(client: ApiClient): BackchannelDisplay {
  if (!client.backchannel_logout_uri && !client.backchannel_logout_internal) {
    return { label: "Not configured", tone: "disabled" };
  }

  if (client.backchannel_logout_internal) {
    return {
      label: "Internal endpoint configured",
      tone: "internal",
      title: "Back-channel logout is enabled on an internal service endpoint.",
    };
  }

  return publicDisplay(client.backchannel_logout_uri);
}

function publicDisplay(uri: string | null): BackchannelDisplay {
  if (!uri) {
    return { label: "Not configured", tone: "disabled" };
  }

  return { label: uri, tone: "public", title: uri };
}
