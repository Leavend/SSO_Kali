import type { NextConfig } from "next";

function buildFrontendContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    connectSrcDirective(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    formActionDirective(),
  ].join("; ");
}

function connectSrcDirective(): string {
  const origins = ["'self'"];
  const ssoBaseUrl = process.env.NEXT_PUBLIC_SSO_BASE_URL;

  if (ssoBaseUrl) {
    origins.push(ssoBaseUrl);
  }

  return `connect-src ${origins.join(" ")}`;
}

function formActionDirective(): string {
  const origins = ["'self'"];
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;

  if (appBaseUrl) {
    origins.push(appBaseUrl);
  }

  return `form-action ${origins.join(" ")}`;
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: buildFrontendContentSecurityPolicy(),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  compress: false, // Nginx handles gzip more efficiently
  poweredByHeader: false,
  serverExternalPackages: ["jose"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
