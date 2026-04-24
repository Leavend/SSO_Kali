<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2).'/Support/UnitOidcDatabase.php';

use App\Actions\Oidc\PerformSingleSignOut;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\LogoutOutcomeMetrics;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\SigningKeyService;
use App\Services\Zitadel\ZitadelBrokerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

use function Tests\Support\resetOidcUnitTables;
use function Tests\Support\seedOidcUnitUser;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.ttl.access_token_minutes', 15);
    config()->set('sso.ttl.refresh_token_days', 30);

    Cache::flush();
    Http::preventStrayRequests();
    resetOidcUnitTables();
});

function ssoLogoutAction(): PerformSingleSignOut
{
    return new PerformSingleSignOut(
        app(AccessTokenGuard::class),
        app(AccessTokenRevocationStore::class),
        app(RefreshTokenStore::class),
        app(BackChannelSessionRegistry::class),
        app(BackChannelLogoutDispatcher::class),
        app(LogicalSessionStore::class),
        app(ZitadelBrokerService::class),
        app(LogoutOutcomeMetrics::class),
    );
}

it('rejects logout without a valid bearer token', function (): void {
    $request = Request::create('/connect/session/logout', 'POST');

    $response = ssoLogoutAction()->handle($request);

    expect($response->getStatusCode())->toBe(401);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_token');
});

it('revokes refresh tokens for the session and returns success', function (): void {
    seedOidcUnitUser('sub-logout-001');

    $keys = app(SigningKeyService::class);
    $refreshTokens = app(RefreshTokenStore::class);

    // Issue a refresh token to verify it gets revoked
    $rt = $refreshTokens->issue(
        'sub-logout-001',
        'prototype-app-a',
        'openid profile',
        'sid-logout-001',
        null,
        time(),
    );

    // Create a valid access token for the request
    $accessToken = $keys->sign([
        'iss' => 'http://localhost',
        'aud' => 'sso-resource-api',
        'sub' => 'sub-logout-001',
        'client_id' => 'prototype-app-a',
        'token_use' => 'access',
        'scope' => 'openid profile',
        'jti' => 'jti-logout-001',
        'sid' => 'sid-logout-001',
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ]);

    $request = Request::create('/connect/session/logout', 'POST');
    $request->headers->set('Authorization', 'Bearer '.$accessToken);

    $response = ssoLogoutAction()->handle($request);

    expect($response->getStatusCode())->toBe(200);

    $body = json_decode((string) $response->getContent(), true);
    expect($body)
        ->toHaveKey('signed_out', true)
        ->toHaveKey('sid', 'sid-logout-001');

    // Verify refresh token is now invalid
    $found = $refreshTokens->findActive($rt['token'], 'prototype-app-a');
    expect($found)->toBeNull();
});
