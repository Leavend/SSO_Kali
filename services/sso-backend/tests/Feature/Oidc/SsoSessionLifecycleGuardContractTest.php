<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

/**
 * BE-FR022-001 — Active SSO session must re-check user lifecycle
 * (disabled / locked / local-disabled / password-expired / mfa-reset)
 * before issuing an authorization code.
 *
 * FR/UC: FR-022 / UC-18, UC-20, UC-50, UC-55, UC-76.
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.auth.password_max_age_days', 90);

    config()->set('oidc_clients.clients', [
        'app-fr022' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-fr022/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-fr022'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
            'skip_consent' => true,
        ],
    ]);

    /* @phpstan-ignore-next-line — placate static analysis until real factory exists. */
    config()->set('passport.client_secret_hashing', false);
    if (class_exists(ClientSecretHashPolicy::class)) {
        // Touch the helper to ensure it is bootable when secrets are needed elsewhere.
    }
});

it('issues code from active sso session when user lifecycle is allowed', function (): void {
    [$user, $sessionId] = fr022LifecycleSubject('lifecycle-ok@example.test');

    fr022Authorize($this, $user, $sessionId)->assertRedirect();

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_accepted')
        ->where('client_id', 'app-fr022')
        ->where('subject_id', $user->subject_id)
        ->exists())->toBeTrue();
});

it('blocks active sso session when user is admin disabled', function (): void {
    [$user, $sessionId] = fr022LifecycleSubject('lifecycle-disabled@example.test', [
        'disabled_at' => now()->subDay(),
        'disabled_reason' => 'admin_disabled',
    ]);

    $response = fr022Authorize($this, $user, $sessionId);

    fr022AssertNotIssuedCode($response);
    fr022AssertSessionBrokenAuditEvent('app-fr022', 'sso_session_lifecycle_disabled');
});

it('blocks active sso session when local account is disabled', function (): void {
    [$user, $sessionId] = fr022LifecycleSubject('lifecycle-local-off@example.test', [
        'local_account_enabled' => false,
    ]);

    $response = fr022Authorize($this, $user, $sessionId);

    fr022AssertNotIssuedCode($response);
    fr022AssertSessionBrokenAuditEvent('app-fr022', 'sso_session_lifecycle_local_account_disabled');
});

it('blocks active sso session when password is expired', function (): void {
    [$user, $sessionId] = fr022LifecycleSubject('lifecycle-pwd-expired@example.test', [
        'password_changed_at' => now()->subDays(120),
    ]);

    $response = fr022Authorize($this, $user, $sessionId);

    fr022AssertNotIssuedCode($response);
    fr022AssertSessionBrokenAuditEvent('app-fr022', 'sso_session_lifecycle_password_expired');
});

it('blocks active sso session when mfa reset is required', function (): void {
    [$user, $sessionId] = fr022LifecycleSubject('lifecycle-mfa-reset@example.test', [
        'mfa_reset_required' => true,
        'mfa_reset_at' => now()->subHour(),
        'mfa_reset_reason' => 'admin_initiated',
    ]);

    $response = fr022Authorize($this, $user, $sessionId);

    fr022AssertNotIssuedCode($response);
    fr022AssertSessionBrokenAuditEvent('app-fr022', 'sso_session_lifecycle_mfa_reset_required');
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array{0: User, 1: string}
 */
function fr022LifecycleSubject(string $email, array $overrides = []): array
{
    $user = User::factory()->create(array_merge([
        'email' => $email,
        'password_changed_at' => now()->subDay(),
    ], $overrides));

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'BeFr022Lifecycle/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @param  array<string, mixed>  $overrides
 */
function fr022Authorize(mixed $test, User $user, string $sessionId, array $overrides = []): TestResponse
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    $query = array_filter(array_merge([
        'client_id' => 'app-fr022',
        'redirect_uri' => 'https://sso.timeh.my.id/app-fr022/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'state-'.Str::random(24),
        'nonce' => 'nonce-'.Str::random(24),
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ], $overrides), static fn (mixed $value): bool => $value !== null && $value !== '');

    return $test
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.122'])
        ->withHeader('User-Agent', 'BeFr022LifecycleAgent/1.0')
        ->withHeader('X-Request-Id', 'req-fr022-'.Str::random(8))
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query($query));
}

function fr022AssertNotIssuedCode(TestResponse $response): void
{
    if ($response->isRedirect()) {
        $location = (string) $response->headers->get('Location');
        expect($location)
            ->not->toContain('/auth/callback?code=')
            ->and($location)->not->toContain('/auth/callback&code=');
    }

    $hasLocalSessionAccept = AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_accepted')
        ->whereJsonContains('context->decision', 'local_session')
        ->exists();

    expect($hasLocalSessionAccept)->toBeFalse();
}

function fr022AssertSessionBrokenAuditEvent(string $clientId, string $errorCode): void
{
    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_rejected')
        ->where('client_id', $clientId)
        ->where('error_code', $errorCode)
        ->latest('id')
        ->first();

    expect($event)->not->toBeNull();
    expect($event?->context['decision'] ?? null)->toBe('rejected');
}
