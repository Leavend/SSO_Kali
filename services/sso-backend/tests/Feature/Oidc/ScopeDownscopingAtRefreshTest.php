<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;

/**
 * FR-011 / ISSUE-05: Scope downscoping at token refresh.
 *
 * When a client's allowed_scopes are reduced after a refresh token was issued,
 * the new access token must be downscoped to the intersection of the original
 * scope and the client's current allowed_scopes.
 */
beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://dev-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('oidc_clients.clients', [
        'downscope-test-app' => [
            'type' => 'confidential',
            'secret' => password_hash('test-secret-downscope', PASSWORD_ARGON2ID),
            'redirect_uris' => ['https://app.downscope.test/callback'],
            'post_logout_redirect_uris' => ['https://app.downscope.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
    ]);

    User::factory()->create([
        'subject_id' => 'downscope-user-1',
        'subject_uuid' => 'downscope-user-1',
        'role' => 'user',
    ]);

    User::factory()->create([
        'subject_id' => 'downscope-user-2',
        'subject_uuid' => 'downscope-user-2',
        'role' => 'user',
    ]);
});

it('downscopes refresh token when client allowed_scopes are reduced', function (): void {
    $registry = app(DownstreamClientRegistry::class);
    $registry->flush();

    // Issue tokens with original scope (openid profile email)
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'downscope-test-app',
        'scope' => 'openid profile email offline_access',
        'session_id' => 'downscope-session-1',
        'subject_id' => 'downscope-user-1',
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
        'acr' => 'urn:example:loa:1',
    ]);

    expect($tokens)->toHaveKey('refresh_token');

    // Now reduce client's allowed scopes (remove 'email')
    config()->set('oidc_clients.clients.downscope-test-app.allowed_scopes', ['openid', 'profile', 'offline_access']);
    $registry->flush();

    // Refresh the token
    $response = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'downscope-test-app',
        'client_secret' => 'test-secret-downscope',
        'refresh_token' => $tokens['refresh_token'],
    ]);

    $response->assertOk();
    $data = $response->json();

    // The new scope should be downscoped to 'openid profile' (intersection)
    expect($data['scope'])->not->toContain('email')
        ->and($data['scope'])->toContain('openid')
        ->and($data['scope'])->toContain('profile');
});

it('preserves full scope when client allowed_scopes are unchanged', function (): void {
    $registry = app(DownstreamClientRegistry::class);
    $registry->flush();

    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'downscope-test-app',
        'scope' => 'openid profile email offline_access',
        'session_id' => 'downscope-session-2',
        'subject_id' => 'downscope-user-2',
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
        'acr' => 'urn:example:loa:1',
    ]);

    // Refresh without changing allowed_scopes
    $response = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'downscope-test-app',
        'client_secret' => 'test-secret-downscope',
        'refresh_token' => $tokens['refresh_token'],
    ]);

    $response->assertOk();
    $data = $response->json();

    expect($data['scope'])->toContain('openid')
        ->and($data['scope'])->toContain('profile')
        ->and($data['scope'])->toContain('email');
});
