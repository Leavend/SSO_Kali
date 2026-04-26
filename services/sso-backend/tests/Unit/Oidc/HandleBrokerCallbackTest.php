<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2).'/Support/UnitOidcDatabase.php';

use App\Actions\Oidc\HandleBrokerCallback;
use App\Services\Oidc\AuthContextFactory;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\BrokerBrowserSession;
use App\Services\Oidc\BrokerCallbackSuccessLogger;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\UserProfileSynchronizer;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Services\Zitadel\ZitadelTokenVerifier;
use App\Support\Oidc\BrokerAuthFlowCookie;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\Support\FakeUpstreamOidc;

use function Tests\Support\resetOidcUnitTables;
use function Tests\Support\seedOidcUnitUser;

beforeEach(function (): void {
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/zitadel');
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');

    Cache::flush();
    Http::preventStrayRequests();
    resetOidcUnitTables();
});

it('completes the broker callback with a verified upstream id token', function (): void {
    $authRequests = app(AuthRequestStore::class);
    $codes = app(AuthorizationCodeStore::class);
    $profiles = app(UserProfileSynchronizer::class);
    $sessions = app(LogicalSessionStore::class);
    $log = Log::spy();

    $state = $authRequests->put(callbackContext());
    seedOidcUnitUser('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    Cache::put('oidc:logical-session:47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c', 'logical-session-id', 3600);

    fakeCallbackResponses(FakeUpstreamOidc::idToken('broker-session-id'));

    $action = new HandleBrokerCallback(
        $authRequests,
        $codes,
        app(AuthContextFactory::class),
        app(ZitadelBrokerService::class),
        app(ZitadelTokenVerifier::class),
        $profiles,
        $sessions,
        app(BrokerAuthFlowCookie::class),
        app(BrokerBrowserSession::class),
        app(BrokerCallbackSuccessLogger::class),
    );

    $response = $action->handle(callbackRequest($state));
    $code = redirectCode((string) $response->getTargetUrl());
    $payload = $codes->pull($code);

    expect((string) $response->getTargetUrl())->toContain('state=client-state');
    expect($payload['subject_id'])->toBe('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    expect($payload['session_id'])->toBe('logical-session-id');
    expect($payload['auth_time'])->toBeInt();
    expect($payload['amr'])->toBe(['pwd']);
    expect($payload['acr'])->toBe('urn:zitadel:loa:1');

    $log->shouldHaveReceived('info', [
        '[OIDC_BROKER_CALLBACK_SUCCEEDED]',
        Mockery::on(function (array $context): bool {
            return $context['client_id'] === 'prototype-app-a'
                && $context['subject_id'] === '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c'
                && $context['logical_session_id'] === 'logical-session-id'
                && $context['broker_session_id'] === 'broker-session-id'
                && $context['amr'] === ['pwd']
                && $context['acr'] === 'urn:zitadel:loa:1'
                && $context['upstream_refresh_token_present'] === true;
        }),
    ]);
});

it('rejects the broker callback when the upstream id token signature is invalid', function (): void {
    $authRequests = app(AuthRequestStore::class);
    $codes = app(AuthorizationCodeStore::class);
    $profiles = app(UserProfileSynchronizer::class);
    $sessions = app(LogicalSessionStore::class);

    $state = $authRequests->put(callbackContext());

    fakeCallbackResponses(FakeUpstreamOidc::tamperedIdToken('broker-session-id'));

    $action = new HandleBrokerCallback(
        $authRequests,
        $codes,
        app(AuthContextFactory::class),
        app(ZitadelBrokerService::class),
        app(ZitadelTokenVerifier::class),
        $profiles,
        $sessions,
        app(BrokerAuthFlowCookie::class),
        app(BrokerBrowserSession::class),
        app(BrokerCallbackSuccessLogger::class),
    );

    $response = $action->handle(callbackRequest($state));

    expect((string) $response->getTargetUrl())->toContain('error=temporarily_unavailable');
    expect(DB::table('users')->count())->toBe(0);
});

it('redirects browser callbacks with expired broker state back to the downstream callback', function (): void {
    $action = new HandleBrokerCallback(
        app(AuthRequestStore::class),
        app(AuthorizationCodeStore::class),
        app(AuthContextFactory::class),
        app(ZitadelBrokerService::class),
        app(ZitadelTokenVerifier::class),
        app(UserProfileSynchronizer::class),
        app(LogicalSessionStore::class),
        app(BrokerAuthFlowCookie::class),
        app(BrokerBrowserSession::class),
        app(BrokerCallbackSuccessLogger::class),
    );

    $request = callbackRequest('expired-state');
    $request->cookies->set(BrokerAuthFlowCookie::NAME, json_encode([
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
        'original_state' => 'client-state',
    ], JSON_THROW_ON_ERROR));

    $response = $action->handle($request);

    expect((string) $response->getTargetUrl())->toContain('http://localhost:3000/auth/callback')
        ->and((string) $response->getTargetUrl())->toContain('error=invalid_request')
        ->and((string) $response->getTargetUrl())->toContain('state=client-state');
});

function callbackContext(): array
{
    return [
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'scope' => 'openid profile email',
        'nonce' => 'client-nonce',
        'original_state' => 'client-state',
        'downstream_code_challenge' => 'downstream-challenge',
        'session_id' => 'broker-session-id',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Pest',
        'device_fingerprint' => null,
        'upstream_code_verifier' => 'upstream-verifier',
    ];
}

function fakeCallbackResponses(string $idToken): void
{
    Http::fake([
        'https://zitadel.example/oauth/v2/token' => Http::response([
            'access_token' => 'upstream-access-token',
            'refresh_token' => 'upstream-refresh-token',
            'id_token' => $idToken,
            'token_type' => 'Bearer',
            'expires_in' => 3600,
        ], 200),
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
        'https://zitadel.example/oidc/v1/userinfo' => Http::response([
            'sub' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
            'email' => 'ada@example.com',
            'name' => 'Ada Lovelace',
            'email_verified' => true,
        ], 200),
    ]);
}

function callbackRequest(string $state): Request
{
    return Request::create('/callbacks/zitadel', 'GET', [
        'code' => 'upstream-code',
        'state' => $state,
    ]);
}

function redirectCode(string $location): string
{
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    return (string) ($query['code'] ?? '');
}
