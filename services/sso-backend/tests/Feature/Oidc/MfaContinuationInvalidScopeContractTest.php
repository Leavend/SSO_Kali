<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;
use OTPHP\TOTP;

/**
 * BE-FR023-001 — MFA continuation must surface invalid scope safely.
 *
 * Scenario: a registry change between local-login (which bound the
 * pending OIDC context) and MFA verify removes a previously-allowed
 * scope. The continuation MUST fail safe — no code, no silent rewrite.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'fr023-mfa-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr023-mfa.test/callback'],
            'post_logout_redirect_uris' => ['https://fr023-mfa.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 5);
    config()->set('sso.auth.login_lockout_seconds', 900);
    config()->set('sso.admin.mfa.enforced', false);

    app(DownstreamClientRegistry::class)->flush();

    $this->totpSecret = TOTP::generate()->getSecret();

    $this->user = User::factory()->create([
        'subject_id' => 'fr023-mfa-user',
        'subject_uuid' => 'fr023-mfa-user',
        'email' => 'fr023.mfa@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);

    MfaCredential::factory()->totp()->verified()->create([
        'user_id' => $this->user->getKey(),
        'secret' => $this->totpSecret,
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('fr023.mfa@example.com');
});

it('rejects mfa continuation when scope policy tightened mid-flow', function (): void {
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    $login = $this->postJson('/connect/local-login', [
        'email' => 'fr023.mfa@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr023-mfa-app',
        'redirect_uri' => 'https://fr023-mfa.test/callback',
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'state' => 'fr023-mfa-state',
        'nonce' => 'fr023-mfa-nonce',
        'scope' => 'openid profile email',
    ])->assertOk();

    $challengeId = (string) $login->json('challenge.challenge_id');

    // Tighten the scope policy: drop "email" between login and MFA verify.
    config()->set('oidc_clients.clients.fr023-mfa-app.allowed_scopes', ['openid', 'profile']);
    app(DownstreamClientRegistry::class)->flush();

    $totp = TOTP::createFromSecret($this->totpSecret);
    $totp->setDigits(6);
    $totp->setPeriod(30);

    $response = $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challengeId,
        'method' => 'totp',
        'code' => $totp->now(),
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('error', 'invalid_scope');

    expect($response->json())->not->toHaveKey('continuation')
        ->and($response->json())->not->toHaveKey('redirect_uri');

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_accepted')
        ->whereJsonContains('context->decision', 'mfa_continuation_success')
        ->exists())->toBeFalse();
});
