<?php

declare(strict_types=1);

/**
 * SSO Frontend Reverse-Proxy Contract — ISSUE-07.
 *
 * Memastikan `services/sso-frontend/deploy/nginx.conf.template` dan
 * `Dockerfile` tetap konsisten dengan security posture yang diperlukan
 * portal: same-origin reverse-proxy ke backend, security headers, dan
 * rate-limiting endpoint sensitif.
 */

function ssoFrontendFile(string $relativePath): string
{
    $path = dirname(base_path(), 1).DIRECTORY_SEPARATOR.'sso-frontend'.DIRECTORY_SEPARATOR.ltrim($relativePath, '/');

    return (string) file_get_contents($path);
}

describe('Nginx template reverse-proxy contract', function (): void {
    it('declares the upstream template placeholder and backend keepalive', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('upstream sso_backend')
            ->toContain('server ${SSO_BACKEND_UPSTREAM};')
            ->toContain('keepalive 16;');
    });

    it('proxies every SSO backend path same-origin', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        $mustProxy = [
            'location /api/',
            'location /oauth/',
            'location /oauth2/',
            'location /connect/',
            'location = /authorize',
            'location = /token',
            'location = /revocation',
            'location = /userinfo',
            'location = /jwks',
            'location /.well-known/',
        ];

        foreach ($mustProxy as $needle) {
            expect($template)->toContain($needle);
        }
    });

    it('applies rate-limiting to login endpoint and general API', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('limit_req_zone $binary_remote_addr zone=sso_auth_login:10m rate=10r/m')
            ->toContain('limit_req_zone $binary_remote_addr zone=sso_api_general:10m rate=120r/m')
            ->toContain('location = /api/auth/login')
            ->toContain('limit_req zone=sso_auth_login burst=5 nodelay')
            ->toContain('limit_req zone=sso_api_general burst=60 nodelay');
    });

    it('enforces comprehensive security headers', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        $headers = [
            'X-Content-Type-Options "nosniff"',
            'X-Frame-Options "DENY"',
            'Referrer-Policy "strict-origin-when-cross-origin"',
            'Permissions-Policy',
            'Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"',
            'Cross-Origin-Opener-Policy "same-origin"',
            'Cross-Origin-Resource-Policy "same-origin"',
            'Content-Security-Policy',
        ];

        foreach ($headers as $header) {
            expect($template)->toContain($header);
        }
    });

    it('scopes Content-Security-Policy to same-origin and Google Fonts only', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain("default-src 'self'")
            ->toContain("frame-ancestors 'none'")
            ->toContain("object-src 'none'")
            ->toContain("script-src 'self'")
            ->toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
            ->toContain('font-src \'self\' https://fonts.gstatic.com data:')
            ->toContain("connect-src 'self' \${SSO_CSP_CONNECT_SRC}")
            ->toContain("form-action 'self'");
    });

    it('serves the SPA fallback with a non-cached index.html', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('try_files $uri $uri/ /index.html')
            ->toContain('Cache-Control "no-cache, no-store, must-revalidate"');
    });

    it('caches hashed Vite assets aggressively as immutable', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('location /assets/')
            ->toContain('Cache-Control "public, max-age=31536000, immutable"')
            ->toContain('expires 1y');
    });

    it('exposes a dedicated healthz probe endpoint', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('location = /healthz')
            ->toContain("return 200 \"ok\\n\"");
    });

    it('caps request body size and hides Nginx version banner', function (): void {
        $template = ssoFrontendFile('deploy/nginx.conf.template');

        expect($template)
            ->toContain('client_max_body_size 64k')
            ->toContain('server_tokens off');
    });
});

describe('Docker entrypoint renders template with runtime env', function (): void {
    it('entrypoint requires SSO_BACKEND_UPSTREAM and runs envsubst before nginx', function (): void {
        $entrypoint = ssoFrontendFile('deploy/docker-entrypoint.sh');

        expect($entrypoint)
            ->toContain('SSO_BACKEND_UPSTREAM is required')
            ->toContain("envsubst '\${SSO_BACKEND_UPSTREAM} \${SSO_FRONTEND_SERVER_NAME} \${SSO_CSP_CONNECT_SRC}'")
            ->toContain('nginx -t')
            ->toContain('exec "$@"');
    });

    it('Dockerfile uses multi-stage build and installs gettext for envsubst', function (): void {
        $dockerfile = ssoFrontendFile('Dockerfile');

        expect($dockerfile)
            ->toContain('FROM node:24-alpine AS deps')
            ->toContain('FROM node:24-alpine AS builder')
            ->toContain('FROM nginx:1.29-alpine AS runner')
            ->toContain('apk add --no-cache gettext')
            ->toContain('ENTRYPOINT ["/docker-entrypoint-ssofrontend.sh"]')
            ->toContain('CMD ["nginx", "-g", "daemon off;"]');
    });

    it('Dockerfile provides build args for every Vite env surface', function (): void {
        $dockerfile = ssoFrontendFile('Dockerfile');

        foreach ([
            'VITE_SSO_API_URL',
            'VITE_APP_NAME',
            'VITE_OIDC_ISSUER',
            'VITE_OIDC_CLIENT_ID',
            'VITE_OIDC_SCOPE',
            'VITE_OIDC_REDIRECT_URI',
            'VITE_OIDC_AUTHORIZE_ENDPOINT',
            'VITE_OIDC_TOKEN_ENDPOINT',
        ] as $argName) {
            expect($dockerfile)->toContain('ARG '.$argName)
                ->and($dockerfile)->toContain('ENV '.$argName.'=${'.$argName.'}');
        }
    });
});
