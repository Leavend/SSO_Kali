<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
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

    $this->postJson('/api/auth/login', ['identifier' => 'consolidated@example.test', 'password' => 'CorrectPassword123!'])
        ->assertStatus(429)
        ->assertJsonPath('error', 'too_many_attempts');
});

it('locks out connect local login after the shared local password threshold', function (): void {
    $payload = localLoginPayload('wrong-password');

    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();
    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();
    $this->postJson('/connect/local-login', $payload)->assertUnauthorized();

    $this->postJson('/connect/local-login', localLoginPayload('CorrectPassword123!'))
        ->assertStatus(429)
        ->assertJsonPath('error', 'too_many_attempts');
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
