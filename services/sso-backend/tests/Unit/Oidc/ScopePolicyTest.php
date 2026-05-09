<?php

declare(strict_types=1);

use App\Services\Oidc\ScopePolicy;
use App\Support\Oidc\DownstreamClient;

function scopePolicyClient(array $allowedScopes): DownstreamClient
{
    return new DownstreamClient(
        clientId: 'scope-test-client',
        type: 'public',
        redirectUris: ['https://app.example.test/callback'],
        postLogoutRedirectUris: [],
        allowedScopes: $allowedScopes,
    );
}

it('normalizes and deduplicates scope strings', function (): void {
    expect(app(ScopePolicy::class)->normalizeString(' openid profile openid email '))
        ->toBe('openid profile email');
});

it('requires openid for authorization requests', function (): void {
    app(ScopePolicy::class)->validateAuthorizationRequest('profile email', scopePolicyClient(['openid', 'profile', 'email']));
})->throws(RuntimeException::class, 'openid scope is required.');

it('rejects unknown requested scopes', function (): void {
    app(ScopePolicy::class)->validateAuthorizationRequest('openid unknown_scope', scopePolicyClient(['openid']));
})->throws(RuntimeException::class, 'Unknown OIDC scope requested: unknown_scope');

it('rejects scopes not allowed for the client', function (): void {
    app(ScopePolicy::class)->validateAuthorizationRequest('openid roles', scopePolicyClient(['openid', 'profile']));
})->throws(RuntimeException::class, 'OIDC scope is not allowed for this client: roles');

it('returns a normalized scope string when request is allowed', function (): void {
    $scope = app(ScopePolicy::class)->validateAuthorizationRequest(
        'openid profile roles profile',
        scopePolicyClient(['openid', 'profile', 'roles']),
    );

    expect($scope)->toBe('openid profile roles');
});
