<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2).'/Support/UnitOidcDatabase.php';

use App\Actions\Oidc\RevokeToken;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
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
    config()->set('sso.ttl.refresh_token_days', 30);

    Cache::flush();
    Http::preventStrayRequests();
    resetOidcUnitTables();
});

function revokeAction(): RevokeToken
{
    return new RevokeToken(
        app(DownstreamClientRegistry::class),
        app(RefreshTokenStore::class),
        app(SigningKeyService::class),
        app(AccessTokenRevocationStore::class),
        app(ZitadelBrokerService::class),
    );
}

it('returns success for unknown client_id to avoid revocation endpoint enumeration', function (): void {
    $response = revokeAction()->handle(Request::create('/revocation', 'POST', [
        'client_id' => 'unknown-client',
        'token' => 'some-token',
    ]));

    expect($response->getStatusCode())->toBe(200);
    expect(json_decode((string) $response->getContent(), true))->toBe([]);
});

it('returns 200 for unknown refresh tokens per RFC 7009 §2.2', function (): void {
    $response = revokeAction()->handle(Request::create('/revocation', 'POST', [
        'client_id' => 'prototype-app-a',
        'token' => 'rt_nonexistent.tokensecret',
        'token_type_hint' => 'refresh_token',
    ]));

    expect($response->getStatusCode())->toBe(200);
});

it('revokes a valid refresh token', function (): void {
    seedOidcUnitUser('sub-revoke-001');

    $store = app(RefreshTokenStore::class);
    $result = $store->issue(
        'sub-revoke-001',
        'prototype-app-a',
        'openid profile',
        'session-revoke-001',
        null,
        time(),
    );

    $response = revokeAction()->handle(Request::create('/revocation', 'POST', [
        'client_id' => 'prototype-app-a',
        'token' => $result['token'],
        'token_type_hint' => 'refresh_token',
    ]));

    expect($response->getStatusCode())->toBe(200);

    // Verify the token is now invalid
    $found = $store->findActive($result['token'], 'prototype-app-a');
    expect($found)->toBeNull();
});

it('returns 200 for unknown access tokens per RFC 7009 §2.2', function (): void {
    $response = revokeAction()->handle(Request::create('/revocation', 'POST', [
        'client_id' => 'prototype-app-a',
        'token' => 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
        'token_type_hint' => 'access_token',
    ]));

    expect($response->getStatusCode())->toBe(200);
});
