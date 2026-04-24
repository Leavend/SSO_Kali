export type IntegrationCheck = {
  readonly label: string;
  readonly value: string;
};

export const integrationChecks: readonly IntegrationCheck[] = [
  {
    label: "Response Type",
    value: "code",
  },
  {
    label: "PKCE Method",
    value: "S256",
  },
  {
    label: "Session Strategy",
    value: "Redis-backed local session with HttpOnly session cookie",
  },
  {
    label: "Logout Sync",
    value: "Back-channel logout by sid via signed logout_token",
  },
];
