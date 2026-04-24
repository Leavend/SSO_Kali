<?php

declare(strict_types=1);

use App\Actions\Oidc\CreateAuthorizationRedirect;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\HighAssuranceClientPolicy;
use App\Services\Oidc\OidcProfileMetrics;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Oidc\BrokerAuthFlowCookie;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    config()->set('oidc_clients.clients.prototype-app-a', [
        'type' => 'public',
        'redirect_uris' => ['http://localhost:3001/auth/callback'],
        'post_logout_redirect_uris' => [],
    ]);
    config()->set('sso.broker.client_id', 'broker-client-id');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/oidc');
    config()->set('sso.broker.scope', 'openid profile email');
    config()->set('sso.broker.authorization_endpoint', 'https://idp.example.com/authorize');

    Http::preventStrayRequests();
});

function authRedirectAction(): CreateAuthorizationRedirect
{
    return new CreateAuthorizationRedirect(
        app(DownstreamClientRegistry::class),
        app(AuthRequestStore::class),
        app(HighAssuranceClientPolicy::class),
        app(OidcProfileMetrics::class),
        app(BrokerAuthFlowCookie::class),
        app(ZitadelBrokerService::class),
    );
}

function validAuthQuery(array $overrides = []): array
{
    return [
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'downstream-state-abc',
        'nonce' => 'downstream-nonce-xyz',
        'code_challenge' => base64_encode(random_bytes(32)),
        'code_challenge_method' => 'S256',
        ...$overrides,
    ];
}

it('rejects an unknown client_id', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['client_id' => 'unknown-client'])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_client');
});

it('rejects a mismatched redirect_uri', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['redirect_uri' => 'http://attacker.com/steal'])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_client');
});

it('rejects missing state', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['state' => ''])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('rejects missing nonce', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['nonce' => ''])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('rejects response_type other than code', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['response_type' => 'token'])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('rejects code_challenge_method other than S256', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['code_challenge_method' => 'plain'])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('rejects missing code_challenge', function (): void {
    $query = validAuthQuery();
    unset($query['code_challenge']);

    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', $query),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('rejects scope without openid', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery(['scope' => 'profile email'])),
    );

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_request');
});

it('returns a redirect for a valid authorization request', function (): void {
    $response = authRedirectAction()->handle(
        Request::create('/authorize', 'GET', validAuthQuery()),
    );

    expect($response->getStatusCode())->toBe(302);
});
