<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;

/**
 * BE-FR023-001 — Consent allow continuation must NOT silently downgrade
 * an invalid or unauthorized scope. If the scope policy tightens between
 * the consent screen render and the user's allow click, the redirect
 * back to the client MUST surface error=invalid_scope, not a code.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'fr023-consent-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr023-consent.test/callback'],
            'post_logout_redirect_uris' => ['https://fr023-consent.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => false,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 5);
    config()->set('sso.auth.login_lockout_seconds', 900);

    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'fr023-consent-user',
        'subject_uuid' => 'fr023-consent-user',
        'email' => 'fr023.consent@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('fr023.consent@example.com');
});

it('redirects with invalid_scope when scope policy tightened before allow', function (): void {
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    $login = $this->postJson('/connect/local-login', [
        'email' => 'fr023.consent@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr023-consent-app',
        'redirect_uri' => 'https://fr023-consent.test/callback',
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'state' => 'fr023-consent-state',
        'nonce' => 'fr023-consent-nonce',
        'scope' => 'openid profile email',
    ])->assertOk();

    $consentUri = (string) $login->json('redirect_uri');
    expect($consentUri)->toContain('/auth/consent');

    parse_str((string) parse_url($consentUri, PHP_URL_QUERY), $consentQuery);
    $consentState = (string) ($consentQuery['state'] ?? '');
    expect($consentState)->not->toBe('');

    // Tighten the scope policy after consent was rendered: drop "email".
    config()->set('oidc_clients.clients.fr023-consent-app.allowed_scopes', ['openid', 'profile']);
    app(DownstreamClientRegistry::class)->flush();

    $response = $this->postJson('/connect/consent', [
        'state' => $consentState,
        'decision' => 'allow',
    ])->assertOk();

    $redirect = (string) $response->json('redirect_uri');

    expect($redirect)->toStartWith('https://fr023-consent.test/callback?');
    parse_str((string) parse_url($redirect, PHP_URL_QUERY), $query);

    expect($query['error'] ?? null)->toBe('invalid_scope')
        ->and($query['state'] ?? null)->toBe('fr023-consent-state')
        ->and($query)->not->toHaveKey('code');

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'consent_decision')
        ->where('outcome', 'failed')
        ->where('error_code', 'invalid_scope')
        ->exists())->toBeTrue();
});
