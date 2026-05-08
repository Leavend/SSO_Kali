<?php

declare(strict_types=1);

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
    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertJsonStructure([
            'issuer',
            'authorization_endpoint',
            'token_endpoint',
            'userinfo_endpoint',
            'jwks_uri',
            'response_types_supported',
            'subject_types_supported',
            'id_token_signing_alg_values_supported',
        ])
        ->assertJsonPath('issuer', config('sso.issuer'));
});

it('serves JWKS from both canonical and compatibility endpoints', function (string $uri): void {
    $this->getJson($uri)
        ->assertOk()
        ->assertJsonStructure(['keys']);
})->with([
    'well-known jwks' => ['/.well-known/jwks.json'],
    'compatibility jwks' => ['/jwks'],
]);
