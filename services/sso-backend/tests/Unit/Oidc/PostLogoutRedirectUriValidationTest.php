<?php

declare(strict_types=1);

use App\Support\Oidc\DownstreamClient;

/**
 * FR-010 / UC-04: Post-logout redirect URI validation — attack vector coverage.
 *
 * Mirrors RedirectUriExactMatchTest but for allowsPostLogoutRedirectUri().
 * Ensures the same isWellFormedRedirectUri() guards apply to logout URIs.
 */
function logoutClient(array $postLogoutUris = ['https://app.example/signed-out']): DownstreamClient
{
    return new DownstreamClient(
        clientId: 'logout-test-client',
        type: 'public',
        redirectUris: ['https://app.example/callback'],
        postLogoutRedirectUris: $postLogoutUris,
        allowedScopes: ['openid'],
    );
}

describe('allowsPostLogoutRedirectUri — exact match', function (): void {
    it('accepts exact registered URI', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/signed-out'))->toBeTrue();
    });

    it('rejects unregistered URI', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://evil.example/steal'))->toBeFalse();
    });

    it('rejects trailing slash mismatch', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/signed-out/'))->toBeFalse();
    });

    it('rejects case mismatch in path', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/Signed-Out'))->toBeFalse();
    });

    it('rejects query string injection', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/signed-out?redirect=evil'))->toBeFalse();
    });
});

describe('allowsPostLogoutRedirectUri — well-formed URI guards', function (): void {
    it('rejects fragment in URI', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/signed-out#fragment'))->toBeFalse();
    });

    it('rejects HTTP downgrade', function (): void {
        $client = logoutClient(['http://app.example/signed-out']);
        // Even if registered as HTTP, isWellFormedRedirectUri rejects non-HTTPS for non-localhost
        expect($client->allowsPostLogoutRedirectUri('http://app.example/signed-out'))->toBeFalse();
    });

    it('rejects double-encoded characters', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/signed-out%252F'))->toBeFalse();
    });

    it('rejects path traversal', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/../signed-out'))->toBeFalse();
    });

    it('rejects path traversal with dot-slash', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('https://app.example/./signed-out'))->toBeFalse();
    });

    it('rejects empty URI', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri(''))->toBeFalse();
    });

    it('rejects URI without scheme', function (): void {
        $client = logoutClient();
        expect($client->allowsPostLogoutRedirectUri('//app.example/signed-out'))->toBeFalse();
    });

    it('allows localhost HTTP for development', function (): void {
        $client = logoutClient(['http://localhost:3000/signed-out']);
        expect($client->allowsPostLogoutRedirectUri('http://localhost:3000/signed-out'))->toBeTrue();
    });
});
