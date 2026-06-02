<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;

beforeEach(function (): void {
    config()->set('sso.auth.max_login_attempts', 3);
    config()->set('sso.auth.login_lockout_seconds', 900);
    config()->set('oidc_clients.clients', [
        'local-test-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://local-app.test/callback'],
            'post_logout_redirect_uris' => ['https://local-app.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'consolidated-user',
        'subject_uuid' => 'consolidated-user',
        'email' => 'consolidated@example.test',
        'password' => Hash::make('CorrectPassword123!'),
        'password_changed_at' => now(),
        'local_account_enabled' => true,
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('consolidated@example.test');
});

it('locks out api auth login after the shared local password threshold', function (): void {
    $payload = ['identifier' => 'consolidated@example.test', 'password' => 'wrong-password'];

    $this->postJson('/api/auth/login', $payload)->assertUnauthorized();
    $this->postJson('/api/auth/login', $payload)->assertUnauthorized();
    $this->postJson('/api/auth/login', $payload)->assertUnauthorized();

    $response = $this->postJson('/api/auth/login', ['identifier' => 'consolidated@example.test', 'password' => 'CorrectPassword123!'])
        ->assertStatus(429)
        ->assertJsonPath('error', 'too_many_attempts');

    expect((int) $response->headers->get('Retry-After'))->toBeGreaterThan(0)
        ->and((int) $response->headers->get('Retry-After'))->toBeLessThanOrEqual(900)
        ->and($response->json('retry_after'))->toBe((int) $response->headers->get('Retry-After'));
});

it('locks out connect local login after the shared local password threshold', function (): void {
    $payload = localLoginPayload('wrong-password');

    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();
    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();
    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();

    $response = $this->postJson('/connect/local-login', localLoginPayload('CorrectPassword123!'))
        ->assertStatus(429)
        ->assertJsonPath('error', 'too_many_attempts');

    expect((int) $response->headers->get('Retry-After'))->toBeGreaterThan(0)
        ->and((int) $response->headers->get('Retry-After'))->toBeLessThanOrEqual(900)
        ->and($response->json('retry_after'))->toBe((int) $response->headers->get('Retry-After'));
});

it('rejects disabled accounts consistently on every local password login path', function (): void {
    User::query()->where('email', 'consolidated@example.test')->update(['disabled_at' => now()]);

    $this->postJson('/api/auth/login', ['identifier' => 'consolidated@example.test', 'password' => 'CorrectPassword123!'])
        ->assertUnauthorized()
        ->assertJsonPath('error', 'account_locked');

    $this->postJson('/connect/local-login', localLoginPayload('CorrectPassword123!'))
        ->assertUnauthorized()
        ->assertJsonPath('error', 'account_locked');
});

it('returns a safe consistent password expiry response on every local password login path', function (): void {
    User::query()->where('email', 'consolidated@example.test')->update(['password_changed_at' => now()->subDays(91)]);

    $this->postJson('/api/auth/login', ['identifier' => 'consolidated@example.test', 'password' => 'CorrectPassword123!'])
        ->assertStatus(403)
        ->assertJsonPath('error', 'password_expired');

    $this->postJson('/connect/local-login', localLoginPayload('CorrectPassword123!'))
        ->assertStatus(403)
        ->assertJsonPath('error', 'password_expired');
});

it('stores a browser authorization session after successful api login and reuses it at authorize', function (): void {
    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
    ])->assertOk()
        ->assertJsonPath('authenticated', true);

    expect(session()->has('sso_browser_session'))->toBeTrue();

    $response = $this->get('/authorize?'.http_build_query(localAuthorizeQuery()));

    $response->assertRedirect();

    expect((string) $response->headers->get('Location'))
        ->toStartWith('https://local-app.test/callback?code=')
        ->toContain('state=state-local-consolidated')
        ->not->toContain('https://sso.timeh.my.id/login');
});

it('completes a pending authorization request during successful api login', function (): void {
    $authRequestId = app(AuthRequestStore::class)->put(localAuthRequestContext('state-login-continuation'));

    $response = $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
        'auth_request_id' => $authRequestId,
    ])->assertOk()
        ->assertJsonPath('authenticated', true)
        ->assertJsonPath('next.type', 'redirect');

    $redirectUri = (string) $response->json('next.redirect_uri');
    parse_str((string) parse_url($redirectUri, PHP_URL_QUERY), $query);
    $payload = app(AuthorizationCodeStore::class)->pull((string) ($query['code'] ?? ''));

    expect($redirectUri)
        ->toStartWith('https://local-app.test/callback?code=')
        ->toContain('state=state-login-continuation')
        ->toContain('iss=')
        ->and((string) ($query['code'] ?? ''))->not->toBe('')
        ->and($payload)->toBeArray()
        ->and($payload['client_id'] ?? null)->toBe('local-test-app')
        ->and($payload['subject_id'] ?? null)->toBe('consolidated-user')
        ->and(app(AuthRequestStore::class)->peek((string) $authRequestId))->toBeNull();
});

it('rejects api login continuation when auth_request_id is invalid', function (): void {
    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
        'auth_request_id' => 'missing-auth-request',
    ])->assertStatus(400)
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('error', 'invalid_auth_request');
});

it('consumes api login authorization requests once', function (): void {
    $authRequestId = app(AuthRequestStore::class)->put(localAuthRequestContext('state-once'));

    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
        'auth_request_id' => $authRequestId,
    ])->assertOk()
        ->assertJsonPath('next.type', 'redirect');

    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
        'auth_request_id' => $authRequestId,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_auth_request');
});

it('does not store a browser authorization session after failed api login', function (): void {
    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'wrong-password',
    ])->assertUnauthorized()
        ->assertJsonPath('authenticated', false);

    expect(session()->has('sso_browser_session'))->toBeFalse();
});

it('does not store a browser authorization session while mfa challenge is pending', function (): void {
    $user = User::query()->where('email', 'consolidated@example.test')->firstOrFail();
    MfaCredential::factory()->totp()->verified()->create(['user_id' => $user->id]);

    $this->postJson('/api/auth/login', [
        'identifier' => 'consolidated@example.test',
        'password' => 'CorrectPassword123!',
    ])->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('mfa_required', true);

    expect(session()->has('sso_browser_session'))->toBeFalse();
});

/**
 * @return array<string, string>
 */
function localLoginPayload(string $password): array
{
    return [
        'email' => 'consolidated@example.test',
        'password' => $password,
        'client_id' => 'local-test-app',
        'redirect_uri' => 'https://local-app.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'state-local-consolidated',
        'nonce' => 'nonce-local-consolidated',
        'scope' => 'openid profile email',
    ];
}

/**
 * @return array<string, string>
 */
function localAuthorizeQuery(): array
{
    return [
        'client_id' => 'local-test-app',
        'redirect_uri' => 'https://local-app.test/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'state-local-consolidated',
        'nonce' => 'nonce-local-consolidated',
    ];
}

/**
 * @return array<string, mixed>
 */
function localAuthRequestContext(string $state): array
{
    return [
        'client_id' => 'local-test-app',
        'redirect_uri' => 'https://local-app.test/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'nonce' => 'nonce-local-continuation',
        'original_state' => $state,
        'downstream_code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ];
}
