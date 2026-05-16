<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Str;

/**
 * BE-FR025-001 — Refresh token downscope MUST NOT preserve disallowed scopes.
 *
 * FR/UC: FR-025 / UC-07, UC-13, UC-23, UC-24.
 *
 * When a relying party's `allowed_scopes` is reduced, refresh tokens issued
 * before the reduction MUST be downscoped to the intersection. If the
 * intersection is empty, the refresh request MUST be rejected with
 * `invalid_scope` rather than fall back to the original scope set, which
 * would otherwise re-elevate disallowed scopes silently.
 *
 * Acceptance criteria locked here:
 *   1. Refresh after `openid profile` → reduce client to `openid`
 *      yields a token with scope=`openid` only.
 *   2. Refresh after the entire requested scope set is removed (empty
 *      intersection) is rejected with HTTP 400 `invalid_scope`.
 *   3. Downscoped refresh → /userinfo returns claims consistent with
 *      the new scope set (no `email` claim once `email` is dropped).
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    config()->set('oidc_clients.clients', [
        'fr025-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/fr025/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/fr025'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
            'skip_consent' => true,
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('downscopes refresh to current allowed_scopes intersection', function (): void {
    $issued = fr025MintRefreshToken();

    // Admin tightens client policy: drop `profile` and `email`.
    config()->set('oidc_clients.clients.fr025-app.allowed_scopes', ['openid', 'offline_access']);
    app(DownstreamClientRegistry::class)->flush();

    $refresh = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'fr025-app',
        'refresh_token' => $issued['refresh_token'],
    ])->assertOk();

    $scope = (string) $refresh->json('scope');
    $tokens = explode(' ', $scope);
    sort($tokens);

    expect($tokens)->toBe(['offline_access', 'openid']);

    $userInfo = $this->withHeader('Authorization', 'Bearer '.(string) $refresh->json('access_token'))
        ->getJson('/userinfo')
        ->assertOk()
        ->json();

    // No profile/email claims should leak — they were removed from policy.
    expect($userInfo['email'] ?? null)->toBeNull()
        ->and($userInfo['name'] ?? null)->toBeNull()
        ->and($userInfo['sub'] ?? null)->toBeString();
});

it('rejects refresh when intersection with current allowed_scopes is empty', function (): void {
    $issued = fr025MintRefreshToken('openid profile email offline_access');

    // Admin removes every scope (including offline_access) — the
    // intersection with the original token's scope set is empty.
    config()->set('oidc_clients.clients.fr025-app.allowed_scopes', ['address']);
    app(DownstreamClientRegistry::class)->flush();

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'fr025-app',
        'refresh_token' => $issued['refresh_token'],
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_scope');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string, scope: string}
 */
function fr025MintRefreshToken(string $scope = 'openid profile email offline_access'): array
{
    $user = User::factory()->create([
        'email' => 'fr025-'.Str::random(8).'@example.test',
        'display_name' => 'FR025 Tester',
    ]);

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Fr025/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    $authorize = test()
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => 'fr025-app',
            'redirect_uri' => 'https://sso.timeh.my.id/fr025/auth/callback',
            'response_type' => 'code',
            'scope' => $scope,
            'state' => 'state-'.Str::random(16),
            'nonce' => 'nonce-'.Str::random(16),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $authorize->assertRedirect();

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    $token = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'fr025-app',
        'redirect_uri' => 'https://sso.timeh.my.id/fr025/auth/callback',
        'code' => (string) ($query['code'] ?? ''),
        'code_verifier' => $verifier,
    ])->assertOk();

    /** @var array{access_token: string, id_token: string, refresh_token: string, scope: string} $payload */
    $payload = $token->json();

    // Sanity: id_token decodes — establishes baseline before downscope test.
    app(SigningKeyService::class)->decode((string) $payload['id_token']);

    return $payload;
}
