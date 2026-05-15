<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

it('serves shallow liveness and health endpoints', function (string $uri, array $expectedKeys): void {
    $response = $this->getJson($uri);

    expect($response->getStatusCode())->toBeIn([200, 503]);

    foreach ($expectedKeys as $key) {
        $response->assertJsonStructure([$key]);
    }
})->with([
    'health' => ['/health', ['service', 'healthy']],
    'ready' => ['/ready', ['service', 'ready', 'checks']],
]);

it('serves framework liveness without booting deep dependencies', function (): void {
    $this->get('/up')->assertOk();
});

it('serves OIDC discovery metadata with production-safe shape', function (): void {
    $baseUrl = rtrim((string) config('sso.base_url'), '/');

    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=60')
        ->assertJsonStructure([
            'issuer',
            'authorization_endpoint',
            'token_endpoint',
            'userinfo_endpoint',
            'revocation_endpoint',
            'jwks_uri',
            'response_types_supported',
            'subject_types_supported',
            'id_token_signing_alg_values_supported',
        ])
        ->assertJsonPath('issuer', config('sso.issuer'))
        ->assertJsonPath('authorization_endpoint', $baseUrl.'/oauth/authorize')
        ->assertJsonPath('token_endpoint', $baseUrl.'/oauth/token')
        ->assertJsonPath('revocation_endpoint', $baseUrl.'/oauth/revoke');
});

it('resolves every endpoint advertised by OIDC discovery metadata', function (): void {
    $metadata = $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->json();

    assertAdvertisedEndpointResolves($metadata, 'authorization_endpoint', 'GET');
    assertAdvertisedEndpointResolves($metadata, 'token_endpoint', 'POST');
    assertAdvertisedEndpointResolves($metadata, 'userinfo_endpoint', 'GET');
    assertAdvertisedEndpointResolves($metadata, 'revocation_endpoint', 'POST');
    assertAdvertisedEndpointResolves($metadata, 'jwks_uri', 'GET');
    assertAdvertisedEndpointResolves($metadata, 'end_session_endpoint', 'GET');
});

function advertisedEndpointPath(array $metadata, string $key): string
{
    $endpoint = $metadata[$key] ?? null;

    expect($endpoint)->toBeString();

    $path = parse_url($endpoint, PHP_URL_PATH);

    expect($path)->toBeString()->not->toBe('');

    return ltrim($path, '/');
}

function assertAdvertisedEndpointResolves(array $metadata, string $key, string $method): void
{
    $path = advertisedEndpointPath($metadata, $key);
    $routes = Route::getRoutes()->get($method);

    expect($routes)->toHaveKey($path);
}

it('serves JWKS from both canonical and compatibility endpoints', function (string $uri): void {
    $wellKnown = $this->getJson('/.well-known/jwks.json')
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=60')
        ->assertJsonStructure(['keys']);

    $compatibility = $this->getJson('/jwks')
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=60')
        ->assertExactJson($wellKnown->json());
})->with([
    'well-known jwks' => ['/.well-known/jwks.json'],
    'compatibility jwks' => ['/jwks'],
]);

it('serves both JWKS URLs from the same cached catalog contract', function (): void {
    $wellKnown = $this->getJson('/.well-known/jwks.json')->assertOk();
    $compatibility = $this->getJson('/jwks')->assertOk();

    expect($compatibility->json())->toBe($wellKnown->json());
});
