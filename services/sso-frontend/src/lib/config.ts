export type AdminConfig = {
  readonly issuer: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly jwksUrl: string;
  readonly logoutUrl: string;
  readonly internalLogoutUrl: string;
  readonly internalRevocationUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly adminApiUrl: string;
  readonly appBaseUrl: string;
};

export function getConfig(): AdminConfig {
  const base = process.env.NEXT_PUBLIC_SSO_BASE_URL ?? "http://localhost:8200";
  const appBase = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";

  const internalBase = process.env.SSO_INTERNAL_BASE_URL;

  return {
    issuer: base,
    authorizeUrl: `${base}/authorize`,
    tokenUrl: process.env.SSO_INTERNAL_TOKEN_URL ?? `${base}/token`,
    jwksUrl: process.env.SSO_INTERNAL_JWKS_URL ?? `${base}/jwks`,
    logoutUrl: `${base}/connect/logout`,
    internalLogoutUrl: internalBase ? `${internalBase}/connect/logout` : `${base}/connect/logout`,
    internalRevocationUrl: internalBase ? `${internalBase}/revocation` : `${base}/revocation`,
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID ?? "sso-admin-panel",
    redirectUri: `${appBase}/auth/callback`,
    adminApiUrl: process.env.SSO_INTERNAL_ADMIN_API_URL ?? `${base}/admin/api`,
    appBaseUrl: appBase,
  };
}
