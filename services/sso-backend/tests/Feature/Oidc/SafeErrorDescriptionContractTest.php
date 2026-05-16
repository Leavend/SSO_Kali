<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\SafeOidcErrorDescription;
use App\Support\Security\ClientSecretHashPolicy;
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
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('returns the safe-catalog invalid_scope description at /authorize when an unknown scope is requested', function (): void {
    [$user, $sessionId] = safeErrorBrowserSessionUser();

    $response = $this->withSession([
        'sso_browser_session' => [
            'subject_id' => $user->subject_id,
            'session_id' => $sessionId,
            'auth_time' => time(),
            'amr' => ['pwd'],
        ],
    ])->getJson('/authorize?'.http_build_query([
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile this-scope-does-not-exist',
        'state' => 'state-'.Str::random(8),
        'nonce' => 'nonce-'.Str::random(8),
        'code_challenge' => safeErrorPkce()[1],
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope')
        ->assertJsonPath('error_description', SafeOidcErrorDescription::safe('invalid_scope'));

    expect((string) $response->getContent())
        ->not->toContain('this-scope-does-not-exist')
        ->not->toContain('Unknown OIDC scope');
});

it('returns the safe-catalog invalid_scope description at /connect/local-login when scope is disallowed', function (): void {
    config()->set('oidc_clients.clients', [
        'fr062-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr062.test/callback'],
            'post_logout_redirect_uris' => ['https://fr062.test/'],
            'allowed_scopes' => ['openid', 'profile'],
            'skip_consent' => true,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 5);
    config()->set('sso.auth.login_lockout_seconds', 900);
    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'fr062-user',
        'subject_uuid' => 'fr062-user',
        'email' => 'fr062.user@example.com',
        'password' => 'SecurePass123!',
        'password_changed_at' => now(),
        'role' => 'user',
    ]);

    $response = $this->postJson('/connect/local-login', [
        'client_id' => 'fr062-app',
        'redirect_uri' => 'https://fr062.test/callback',
        'email' => 'fr062.user@example.com',
        'password' => 'SecurePass123!',
        'scope' => 'openid this-scope-does-not-exist',
        'state' => 'state-'.Str::random(8),
        'nonce' => 'nonce-'.Str::random(8),
        'code_challenge' => safeErrorPkce()[1],
        'code_challenge_method' => 'S256',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope')
        ->assertJsonPath('error_description', SafeOidcErrorDescription::safe('invalid_scope'));

    expect((string) $response->getContent())
        ->not->toContain('this-scope-does-not-exist')
        ->not->toContain('Unknown OIDC scope')
        ->not->toContain('not allowed for this client');
});

it('safe error catalog never includes raw exception text or technical reasons', function (): void {
    foreach (['invalid_scope', 'invalid_client', 'invalid_grant', 'invalid_token', 'consent_required'] as $code) {
        $description = SafeOidcErrorDescription::safe($code);

        expect($description)->not->toContain('SQLSTATE')
            ->and($description)->not->toContain('vendor/')
            ->and($description)->not->toContain('->')
            ->and($description)->not->toContain('Exception');
    }
});

/**
 * @return array{0: User, 1: string}
 */
function safeErrorBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'safe-error-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'SafeErrorContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function safeErrorPkce(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
