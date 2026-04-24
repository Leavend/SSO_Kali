<?php

declare(strict_types=1);

use App\Services\Zitadel\ZitadelMetadataService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

it('uses deterministic internal endpoints instead of internal discovery urls', function (): void {
    config()->set('sso.broker.public_issuer', 'https://id.dev-sso.timeh.my.id');
    config()->set('sso.broker.internal_issuer', 'http://id.dev-sso.timeh.my.id:8080');

    Http::fake([
        'http://id.dev-sso.timeh.my.id:8080/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://id.dev-sso.timeh.my.id:8080',
            'token_endpoint' => 'https://id.dev-sso.timeh.my.id:8080/oauth/v2/token',
        ]),
    ]);

    $service = app(ZitadelMetadataService::class);

    expect($service->internalEndpoint('token_endpoint'))
        ->toBe('http://id.dev-sso.timeh.my.id:8080/oauth/v2/token');
});

it('uses canonical zitadel contract paths even when discovery advertises custom endpoint urls', function (): void {
    config()->set('sso.broker.public_issuer', 'https://id.dev-sso.timeh.my.id');
    config()->set('sso.broker.internal_issuer', 'http://zitadel.internal:8080');

    Http::fake([
        'https://id.dev-sso.timeh.my.id/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://id.dev-sso.timeh.my.id',
            'authorization_endpoint' => 'https://id.dev-sso.timeh.my.id/custom/authorize',
            'end_session_endpoint' => 'https://id.dev-sso.timeh.my.id/custom/logout',
        ], 200),
        'http://zitadel.internal:8080/.well-known/openid-configuration' => Http::response([
            'issuer' => 'http://zitadel.internal:8080',
            'token_endpoint' => 'http://zitadel.internal:8080/custom/token',
            'jwks_uri' => 'http://zitadel.internal:8080/custom/keys',
        ], 200),
    ]);

    $service = app(ZitadelMetadataService::class);

    expect($service->publicEndpoint('authorization_endpoint'))
        ->toBe('https://id.dev-sso.timeh.my.id/oauth/v2/authorize')
        ->and($service->publicEndpoint('end_session_endpoint'))
        ->toBe('https://id.dev-sso.timeh.my.id/oidc/v1/end_session')
        ->and($service->internalEndpoint('token_endpoint'))
        ->toBe('http://zitadel.internal:8080/oauth/v2/token')
        ->and($service->internalEndpoint('jwks_uri'))
        ->toBe('http://zitadel.internal:8080/oauth/v2/keys');
});

it('falls back to uncached discovery resolution when cache access is unavailable', function (): void {
    config()->set('sso.broker.public_issuer', 'https://id.dev-sso.timeh.my.id');
    config()->set('sso.broker.internal_issuer', 'http://zitadel.internal:8080');

    Cache::shouldReceive('get')
        ->once()
        ->andThrow(new RuntimeException('redis unavailable'));

    Cache::shouldReceive('put')
        ->once()
        ->andThrow(new RuntimeException('redis unavailable'));

    Http::fake([
        'https://id.dev-sso.timeh.my.id/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://id.dev-sso.timeh.my.id',
            'authorization_endpoint' => 'https://id.dev-sso.timeh.my.id/custom/authorize',
        ], 200),
    ]);

    expect(app(ZitadelMetadataService::class)->publicEndpoint('authorization_endpoint'))
        ->toBe('https://id.dev-sso.timeh.my.id/oauth/v2/authorize');
});
