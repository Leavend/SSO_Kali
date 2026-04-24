<?php

declare(strict_types=1);

use App\Services\Zitadel\ZitadelBrokerService;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    config()->set('sso.broker.public_issuer', 'https://id.example.com');
    config()->set('sso.broker.internal_issuer', 'http://zitadel.internal:8080');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
});

it('uses the canonical authorize and end-session endpoints', function (): void {
    $service = app(ZitadelBrokerService::class);

    expect($service->authorizationUrl(['client_id' => 'broker-client']))
        ->toStartWith('https://id.example.com/oauth/v2/authorize?')
        ->and($service->endSessionUrl(['post_logout_redirect_uri' => 'https://app.example.com']))
        ->toStartWith('https://id.example.com/oidc/v1/end_session?');
});

it('posts token exchange and revocation requests to canonical internal endpoints', function (): void {
    Http::fake([
        'http://zitadel.internal:8080/oauth/v2/token' => Http::response([
            'access_token' => 'token',
        ], 200),
        'http://zitadel.internal:8080/oauth/v2/revoke' => Http::response([], 200),
    ]);

    $service = app(ZitadelBrokerService::class);

    $service->token(['code' => 'upstream-code']);
    $service->revoke('refresh-token', 'refresh_token');

    Http::assertSent(fn ($request) => $request->url() === 'http://zitadel.internal:8080/oauth/v2/token');
    Http::assertSent(fn ($request) => $request->url() === 'http://zitadel.internal:8080/oauth/v2/revoke');
});
