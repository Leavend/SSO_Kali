<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2).'/Support/UnitOidcDatabase.php';

use App\Actions\Oidc\ExchangeToken;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\SigningKeyService;
use App\Services\Oidc\UserProfileSynchronizer;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Oidc\Pkce;
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

    Cache::flush();
    Http::preventStrayRequests();
    resetOidcUnitTables();
});

it('issues local tokens for a valid authorization code exchange', function (): void {
    $codes = app(AuthorizationCodeStore::class);
    $tokens = app(LocalTokenService::class);

    seedOidcUnitUser('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    $code = issueAuthorizationCode($codes, 'prototype-app-a', 'http://localhost:3001/auth/callback');
    $action = exchangeAction($codes, $tokens);

    $response = $action->handle(Request::create('/token', 'POST', [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => $code,
        'code_verifier' => 'client-verifier',
    ]));

    expect($response->getStatusCode())->toBe(200);
    expect(json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR))
        ->toHaveKeys(['access_token', 'id_token', 'refresh_token']);
});

it('preserves upstream auth context in locally issued tokens', function (): void {
    $codes = app(AuthorizationCodeStore::class);
    $tokens = app(LocalTokenService::class);
    $keys = app(SigningKeyService::class);

    seedOidcUnitUser('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    $code = $codes->issue([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'scope' => 'openid profile email offline_access',
        'session_id' => 'logical-session-id',
        'subject_id' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
        'auth_time' => 1_700_000_000,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
        'upstream_refresh_token' => 'upstream-refresh-token',
        'downstream_code_challenge' => Pkce::challengeFrom('client-verifier'),
    ]);

    $response = exchangeAction($codes, $tokens)->handle(Request::create('/token', 'POST', [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => $code,
        'code_verifier' => 'client-verifier',
    ]));

    $payload = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);
    $claims = $keys->decode((string) $payload['access_token']);

    expect($claims['auth_time'])->toBe(1_700_000_000)
        ->and($claims['amr'])->toBe(['pwd', 'mfa'])
        ->and($claims['acr'])->toBe('urn:example:loa:2');
});

it('rejects confidential clients with missing or invalid client secrets', function (?string $clientSecret): void {
    $codes = app(AuthorizationCodeStore::class);
    $tokens = app(LocalTokenService::class);

    seedOidcUnitUser('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    $code = issueAuthorizationCode($codes, 'prototype-app-b', 'http://localhost:8300/auth/callback');
    $payload = [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-b',
        'redirect_uri' => 'http://localhost:8300/auth/callback',
        'code' => $code,
        'code_verifier' => 'client-verifier',
    ];

    if ($clientSecret !== null) {
        $payload['client_secret'] = $clientSecret;
    }

    $response = exchangeAction($codes, $tokens)
        ->handle(Request::create('/token', 'POST', $payload));

    expect($response->getStatusCode())->toBe(401);
    expect(json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR))
        ->toMatchArray(['error' => 'invalid_client']);
})->with([
    'missing secret' => [null],
    'invalid secret' => ['wrong-secret'],
]);

it('rejects confidential clients when the stored verifier secret is plaintext', function (): void {
    config()->set('oidc_clients.clients.prototype-app-b.secret', 'prototype-secret');

    $codes = app(AuthorizationCodeStore::class);
    $tokens = app(LocalTokenService::class);

    seedOidcUnitUser('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    $code = issueAuthorizationCode($codes, 'prototype-app-b', 'http://localhost:8300/auth/callback');

    $response = exchangeAction($codes, $tokens)
        ->handle(Request::create('/token', 'POST', [
            'grant_type' => 'authorization_code',
            'client_id' => 'prototype-app-b',
            'redirect_uri' => 'http://localhost:8300/auth/callback',
            'code' => $code,
            'code_verifier' => 'client-verifier',
            'client_secret' => 'prototype-secret',
        ]));

    expect($response->getStatusCode())->toBe(401);
    expect(json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR))
        ->toMatchArray(['error' => 'invalid_client']);
});

function exchangeAction(AuthorizationCodeStore $codes, LocalTokenService $tokens): ExchangeToken
{
    return new ExchangeToken(
        app(DownstreamClientRegistry::class),
        $codes,
        app(RefreshTokenStore::class),
        $tokens,
        app(ZitadelBrokerService::class),
        app(UserProfileSynchronizer::class),
    );
}

function issueAuthorizationCode(
    AuthorizationCodeStore $codes,
    string $clientId,
    string $redirectUri,
): string {
    return $codes->issue([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'scope' => 'openid profile email offline_access',
        'session_id' => 'logical-session-id',
        'subject_id' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
        'upstream_refresh_token' => 'upstream-refresh-token',
        'downstream_code_challenge' => Pkce::challengeFrom('client-verifier'),
    ]);
}
