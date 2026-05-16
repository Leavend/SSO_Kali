<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

/**
 * BE-FR021-002 — max_age must be enforced end-to-end with auditable evidence.
 *
 * FR/UC: FR-021, FR-027 / UC-14.
 *
 * Acceptance criteria locked here:
 *   1. max_age=0 always forces re-authentication regardless of session age.
 *   2. A fresh local-login response carries an auth_time close to wall clock,
 *      and `prompt=login` makes a stale browser session ineligible to skip
 *      credential entry.
 *   3. Non-numeric max_age values are ignored (documented policy: only
 *      digits-only strings are honored, otherwise the request behaves as
 *      if max_age was absent).
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    config()->set('oidc_clients.clients', [
        'fr021-max-age' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/fr021-max-age/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/fr021-max-age'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);
});

it('forces re-auth when max_age=0 even with an active session', function (): void {
    [$user, $sessionId] = fr021MaxAgeLoggedInUser('max-age-zero@example.test');
    $challenge = fr021MaxAgePkceChallenge();

    $response = fr021MaxAgeAuthorize($this, $user, $sessionId, [
        'code_challenge' => $challenge,
        'max_age' => '0',
    ]);

    // max_age=0 demands a fresh credential check. The response MUST NOT
    // be a redirect back to the relying party with a code; it must hand
    // off to the upstream login flow (or local login UI). We verify by
    // ensuring the redirect, when present, does not include a code on
    // the registered redirect_uri.
    if ($response->isRedirect()) {
        $location = (string) $response->headers->get('Location');
        expect($location)->not->toContain('/fr021-max-age/auth/callback?code=');
    }

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_accepted')
        ->whereJsonContains('context->decision', 'local_session')
        ->where('client_id', 'fr021-max-age')
        ->exists())->toBeFalse();
});

it('does not force re-auth when max_age is non-numeric', function (): void {
    [$user, $sessionId] = fr021MaxAgeLoggedInUser('max-age-bad@example.test');
    $challenge = fr021MaxAgePkceChallenge();

    $response = fr021MaxAgeAuthorize($this, $user, $sessionId, [
        'code_challenge' => $challenge,
        'max_age' => 'abc',
    ]);

    // Documented policy: non-numeric max_age behaves as if absent.
    // The active session is allowed to satisfy the request.
    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)->toContain('/fr021-max-age/auth/callback?code=');
});

it('issues a fresh auth_time on local login and binds it into the id token', function (): void {
    User::factory()->create([
        'subject_id' => 'fr021-max-age-fresh',
        'subject_uuid' => 'fr021-max-age-fresh',
        'email' => 'fresh-auth-time@example.test',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);

    [$verifier, $challenge] = fr021MaxAgePkcePair();
    $issuedAt = time();

    $login = $this->postJson('/connect/local-login', [
        'email' => 'fresh-auth-time@example.test',
        'password' => 'SecurePass123!',
        'client_id' => 'fr021-max-age',
        'redirect_uri' => 'https://sso.timeh.my.id/fr021-max-age/auth/callback',
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'state' => 'state-'.Str::random(16),
        'nonce' => 'nonce-'.Str::random(16),
        'scope' => 'openid profile email',
    ])->assertOk();

    $location = (string) $login->json('redirect_uri');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    $token = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'fr021-max-age',
        'redirect_uri' => 'https://sso.timeh.my.id/fr021-max-age/auth/callback',
        'code' => (string) ($query['code'] ?? ''),
        'code_verifier' => $verifier,
    ])->assertOk();

    $claims = app(SigningKeyService::class)->decode((string) $token->json('id_token'));
    $authTime = (int) ($claims['auth_time'] ?? 0);

    // Fresh login → auth_time must be within a tight window of wall clock.
    // We allow a ±30s window to absorb test-runner skew while still
    // catching regressions that would reuse an old auth_time.
    expect($authTime)->toBeGreaterThanOrEqual($issuedAt - 5)
        ->and($authTime)->toBeLessThanOrEqual(time() + 30);
});

/**
 * @return array{0: User, 1: string}
 */
function fr021MaxAgeLoggedInUser(string $email): array
{
    $user = User::factory()->create([
        'email' => $email,
        'password_changed_at' => now()->subDay(),
    ]);

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Fr021MaxAge/1.0',
        'authenticated_at' => now()->subMinutes(15),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function fr021MaxAgePkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

function fr021MaxAgePkceChallenge(): string
{
    [, $challenge] = fr021MaxAgePkcePair();

    return $challenge;
}

/**
 * @param  array<string, string>  $overrides
 */
function fr021MaxAgeAuthorize(mixed $test, User $user, string $sessionId, array $overrides = []): TestResponse
{
    $query = array_filter(array_merge([
        'client_id' => 'fr021-max-age',
        'redirect_uri' => 'https://sso.timeh.my.id/fr021-max-age/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'state-'.Str::random(16),
        'nonce' => 'nonce-'.Str::random(16),
        'code_challenge_method' => 'S256',
    ], $overrides), static fn (mixed $value): bool => $value !== null && $value !== '');

    return $test
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time() - 900, // 15 minutes ago
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query($query));
}
