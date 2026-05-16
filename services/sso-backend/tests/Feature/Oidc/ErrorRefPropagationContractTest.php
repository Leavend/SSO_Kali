<?php

declare(strict_types=1);

use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('returns a copyable error_ref alongside OAuth errors at the token endpoint', function (): void {
    $requestId = (string) Str::uuid();

    $response = $this->withHeader('X-Request-Id', $requestId)
        ->postJson('/token', [
            'grant_type' => 'unsupported-grant',
            'client_id' => 'app-a',
        ])->assertStatus(400);

    $response->assertJsonPath('error', 'unsupported_grant_type')
        ->assertJsonPath('request_id', $requestId);

    $errorRef = $response->json('error_ref');
    expect($errorRef)->toBeString()
        ->and(str_starts_with((string) $errorRef, 'SSOERR-'))->toBeTrue()
        ->and($response->headers->get('X-Error-Ref'))->toBe($errorRef)
        ->and($response->headers->get('X-Request-Id'))->toBe($requestId);
});

it('keeps the response shape compatible when no error_ref is generated', function (): void {
    $response = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
    ])->assertStatus(400);

    $response->assertJsonStructure(['error', 'error_description']);
    expect($response->json('error_ref'))->not->toBeNull(); // ExchangeToken always logs a ref now
});
