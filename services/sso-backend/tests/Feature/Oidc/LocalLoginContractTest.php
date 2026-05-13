<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;

/**
 * FR-014: Local password login contract test.
 *
 * Covers:
 * - Successful login → returns redirect_uri with code
 * - Invalid credentials → 401 with remaining attempts
 * - Account locked → 401 with account_locked error
 * - Throttled → 429 after max attempts
 * - Missing params → 400
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'local-test-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://local-app.test/callback'],
            'post_logout_redirect_uris' => ['https://local-app.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
            'skip_consent' => true,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 3);
    config()->set('sso.auth.login_lockout_seconds', 900);

    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'local-user-1',
        'subject_uuid' => 'local-user-1',
        'email' => 'user@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('user@example.com');
});

describe('POST /connect/local-login', function (): void {
    it('returns redirect_uri with code on successful login', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        $data = $response->json();

        expect($data['redirect_uri'])->toContain('https://local-app.test/callback')
            ->and($data['redirect_uri'])->toContain('code=')
            ->and($data['redirect_uri'])->toContain('state=random-state-123');
    });

    it('returns 401 with invalid credentials', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'WrongPassword!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'state-1',
            'nonce' => 'nonce-1',
            'scope' => 'openid',
        ]);

        $response->assertStatus(401);
        $data = $response->json();

        expect($data['error'])->toBe('invalid_credentials')
            ->and($data['remaining_attempts'])->toBe(2);
    });

    it('returns 401 with account_locked for disabled user', function (): void {
        User::query()->where('email', 'user@example.com')->update([
            'disabled_at' => now(),
            'disabled_reason' => 'Too many failed attempts',
        ]);

        $response = $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'state-2',
            'nonce' => 'nonce-2',
            'scope' => 'openid',
        ]);

        $response->assertStatus(401);
        expect($response->json('error'))->toBe('account_locked');
    });

    it('returns 429 after max failed attempts', function (): void {
        $payload = [
            'email' => 'user@example.com',
            'password' => 'WrongPassword!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'state-3',
            'nonce' => 'nonce-3',
            'scope' => 'openid',
        ];

        // Exhaust attempts
        $this->postJson('/connect/local-login', $payload);
        $this->postJson('/connect/local-login', $payload);
        $this->postJson('/connect/local-login', $payload);

        // Next attempt should be throttled
        $response = $this->postJson('/connect/local-login', $payload);

        $response->assertStatus(429);
        expect($response->json('error'))->toBe('too_many_attempts');
    });

    it('returns 400 for missing email/password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'test',
            'code_challenge_method' => 'S256',
            'state' => 'state-4',
        ]);

        $response->assertStatus(400);
    });

    it('returns 400 for invalid client', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'unknown-client',
            'redirect_uri' => 'https://evil.test/callback',
            'code_challenge' => 'test',
            'code_challenge_method' => 'S256',
            'state' => 'state-5',
            'nonce' => 'nonce-5',
            'scope' => 'openid',
        ]);

        $response->assertStatus(400);
    });

    it('clears throttle on successful login', function (): void {
        $throttle = app(LoginAttemptThrottle::class);

        // Record some failures
        $throttle->recordFailure('user@example.com');
        $throttle->recordFailure('user@example.com');

        // Successful login
        $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'state-6',
            'nonce' => 'nonce-6',
            'scope' => 'openid',
        ]);

        expect($throttle->attempts('user@example.com'))->toBe(0);
    });

    it('returns 403 when password is expired (UC-20)', function (): void {
        User::query()->where('email', 'user@example.com')->update([
            'password_changed_at' => now()->subDays(91),
        ]);

        $response = $this->postJson('/connect/local-login', [
            'email' => 'user@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'local-test-app',
            'redirect_uri' => 'https://local-app.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'state-7',
            'nonce' => 'nonce-7',
            'scope' => 'openid',
        ]);

        $response->assertStatus(403);
        expect($response->json('error'))->toBe('password_expired')
            ->and($response->json('change_password_url'))->toBe('/profile/security');
    });
});
