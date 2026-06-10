<?php

declare(strict_types=1);

use App\Support\Oidc\OidcScope;

it('keeps developer API reference docs aligned with public OIDC contracts', function (): void {
    $root = dirname(base_path(), 2);
    $docsDir = $root.DIRECTORY_SEPARATOR.'docs/developers';

    $files = [
        'README.md',
        'api-reference.md',
        'scopes-and-claims.md',
        'errors.md',
        'security-model.md',
        'resource-server.md',
    ];

    foreach ($files as $file) {
        expect($docsDir.DIRECTORY_SEPARATOR.$file)->toBeFile();
    }

    $content = implode("\n", array_map(
        static fn (string $file): string => (string) file_get_contents($docsDir.DIRECTORY_SEPARATOR.$file),
        $files,
    ));

    expect($content)
        ->toContain('/.well-known/openid-configuration')
        ->toContain('/.well-known/jwks.json')
        ->toContain('/authorize')
        ->toContain('/oauth2/authorize')
        ->toContain('/token')
        ->toContain('/oauth2/token')
        ->toContain('/userinfo')
        ->toContain('/revocation')
        ->toContain('/oauth/revoke')
        ->toContain('/introspect')
        ->toContain('/oauth2/introspect')
        ->toContain('/connect/logout')
        ->toContain('/connect/register-session')
        ->toContain('S256')
        ->toContain('ES256')
        ->toContain('sso-resource-api')
        ->toContain('error_ref')
        ->toContain('request_id')
        ->toContain('SSOERR-')
        ->toContain('openid-client')
        ->toContain('authlib')
        ->toContain('passport-oauth2')
        ->toContain('Authorization Code + PKCE');

    foreach (OidcScope::names() as $scope) {
        expect($content)->toContain('`'.$scope.'`');
    }
});

it('documents OIDC lifetimes and rate limits from backend configuration', function (): void {
    $root = dirname(base_path(), 2);
    $docsDir = $root.DIRECTORY_SEPARATOR.'docs/developers';
    $content = (string) file_get_contents($docsDir.DIRECTORY_SEPARATOR.'security-model.md');

    expect($content)
        ->toContain((string) config('sso.stores.authorization_code_seconds').' detik')
        ->toContain((string) config('sso.stores.auth_request_seconds').' detik')
        ->toContain((string) config('sso.ttl.access_token_minutes').' menit')
        ->toContain((string) config('sso.ttl.id_token_minutes').' menit')
        ->toContain((string) config('sso.ttl.refresh_token_days').' hari')
        ->toContain((string) config('sso.ttl.refresh_token_family_days').' hari')
        ->toContain((string) config('sso.rate_limits.authorize_per_minute').'/min/IP')
        ->toContain((string) config('sso.rate_limits.token_per_minute').'/min/IP')
        ->toContain((string) config('sso.rate_limits.resource_per_minute').'/min/IP')
        ->toContain((string) config('sso.rate_limits.discovery_per_minute').'/min/IP')
        ->toContain((string) config('sso.rate_limits.jwks_per_minute').'/min/IP');
});

it('does not publish live secrets or token literals in developer docs', function (): void {
    $root = dirname(base_path(), 2);
    $docsDir = $root.DIRECTORY_SEPARATOR.'docs/developers';
    $content = implode("\n", array_map(
        static fn (string $file): string => (string) file_get_contents($file),
        glob($docsDir.DIRECTORY_SEPARATOR.'*.md') ?: [],
    ));

    expect($content)
        ->not->toMatch('/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/')
        ->not->toMatch('/rt_[A-Za-z0-9]{20,}/')
        ->not->toMatch('/sk_(live|test)_[A-Za-z0-9]+/')
        ->not->toMatch('/client_secret\s*=\s*[A-Za-z0-9_-]{24,}/');
});

it('points the admin clients page to the developer documentation index', function (): void {
    $root = dirname(base_path(), 2);
    $clientsPage = $root.DIRECTORY_SEPARATOR.'services/sso-admin-frontend/src/features/clients/pages/ClientsPage.vue';
    $idLocale = $root.DIRECTORY_SEPARATOR.'services/sso-admin-frontend/src/locales/id.json';
    $enLocale = $root.DIRECTORY_SEPARATOR.'services/sso-admin-frontend/src/locales/en.json';

    expect($clientsPage)->toBeFile()
        ->and((string) file_get_contents($clientsPage))->toContain('/docs/developers/README.md')
        ->and((string) file_get_contents($idLocale))->toContain('Panduan Developer')
        ->and((string) file_get_contents($enLocale))->toContain('Developer Guide');
});
