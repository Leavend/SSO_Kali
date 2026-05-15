<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\ScopePolicy;
use App\Support\Oidc\OidcScope;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
});

it('does not include offline access in default allowed scopes', function (): void {
    expect(OidcScope::defaultAllowed())->not->toContain('offline_access')
        ->and(app(ScopePolicy::class)->defaultAllowedScopes())->not->toContain('offline_access');
});

it('rejects authorization requests for offline access when client policy does not allow it', function (): void {
    config()->set('oidc_clients.clients', [
        'app-no-offline' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();

    [$user, $sessionId] = issueOfflinePolicyBrowserSessionUser();
    $response = $this->withSession([
        'sso_browser_session' => [
            'subject_id' => $user->subject_id,
            'session_id' => $sessionId,
            'auth_time' => time(),
            'amr' => ['pwd'],
        ],
    ])->get('/authorize?'.http_build_query([
        'client_id' => 'app-no-offline',
        'redirect_uri' => 'https://sso.timeh.my.id/app/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => 'state-'.Str::random(24),
        'nonce' => 'nonce-'.Str::random(24),
        'code_challenge' => issueOfflinePolicyChallenge('verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope');
});

it('does not issue refresh tokens unless offline access is explicitly allowed and requested', function (): void {
    config()->set('oidc_clients.clients', [
        'app-no-offline' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/no-offline/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/no-offline'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
        ],
        'app-offline' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/offline/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/offline'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();

    $withoutPolicy = app(LocalTokenService::class)->issue([
        'client_id' => 'app-no-offline',
        'scope' => 'openid profile email offline_access',
        'session_id' => (string) Str::uuid(),
        'subject_id' => User::factory()->create()->subject_id,
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    $allowedButNotRequested = app(LocalTokenService::class)->issue([
        'client_id' => 'app-offline',
        'scope' => 'openid profile email',
        'session_id' => (string) Str::uuid(),
        'subject_id' => User::factory()->create()->subject_id,
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    $allowedAndRequested = app(LocalTokenService::class)->issue([
        'client_id' => 'app-offline',
        'scope' => 'openid profile email offline_access',
        'session_id' => (string) Str::uuid(),
        'subject_id' => User::factory()->create()->subject_id,
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    expect($withoutPolicy)->not->toHaveKey('refresh_token')
        ->and($allowedButNotRequested)->not->toHaveKey('refresh_token')
        ->and($allowedAndRequested)->toHaveKey('refresh_token');
});

/**
 * @return array{0: User, 1: string}
 */
function issueOfflinePolicyBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'offline-policy-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'OfflineAccessPolicyContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function issueOfflinePolicyChallenge(string $verifier): string
{
    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}
