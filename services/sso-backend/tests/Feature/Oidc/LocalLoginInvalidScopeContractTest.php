<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;

/**
 * BE-FR023-001 — Local Login / MFA Continuation must NOT silently
 * downgrade an invalid or unauthorized scope to "openid".
 *
 * FR/UC: FR-023, FR-025, FR-028 / UC-10, UC-13, UC-16, UC-23.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'fr023-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr023.test/callback'],
            'post_logout_redirect_uris' => ['https://fr023.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 5);
    config()->set('sso.auth.login_lockout_seconds', 900);

    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'fr023-user',
        'subject_uuid' => 'fr023-user',
        'email' => 'fr023.user@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('fr023.user@example.com');
});

it('rejects local login with unknown scope as invalid_scope', function (): void {
    $response = $this->postJson('/connect/local-login', [
        'email' => 'fr023.user@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr023-app',
        'redirect_uri' => 'https://fr023.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr023-unknown-scope',
        'nonce' => 'fr023-nonce-uk',
        'scope' => 'openid bogus_scope',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope');

    expect($response->json())->not->toHaveKey('redirect_uri');
});

it('rejects local login with disallowed scope for client as invalid_scope', function (): void {
    $response = $this->postJson('/connect/local-login', [
        'email' => 'fr023.user@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr023-app',
        'redirect_uri' => 'https://fr023.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr023-disallowed-scope',
        'nonce' => 'fr023-nonce-da',
        // offline_access is NOT in fr023-app allowed_scopes
        'scope' => 'openid offline_access',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope');

    expect($response->json())->not->toHaveKey('redirect_uri');
});

it('rejects local login when openid is missing as invalid_scope', function (): void {
    $response = $this->postJson('/connect/local-login', [
        'email' => 'fr023.user@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr023-app',
        'redirect_uri' => 'https://fr023.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr023-no-openid',
        'nonce' => 'fr023-nonce-no',
        'scope' => 'profile email',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope');
});
