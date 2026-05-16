<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

/**
 * BE-FR029-001 — Authorization Code Exchange Edge Evidence.
 *
 * Locks the edges that {@see TokenEndpointHardeningContractTest} did not
 * cover explicitly:
 *
 *   1. The authorization code is consumed even when downstream
 *      validation (client secret / PKCE / redirect_uri) fails, so a
 *      failed exchange cannot be replayed.
 *   2. HTTP Basic client authentication takes precedence over body
 *      `client_id`/`client_secret` (RFC 6749 §2.3.1) — a Basic header
 *      with the right credentials wins even if the body contains a
 *      conflicting client.
 *   3. The wire `error_description` never carries raw exception text
 *      or scope reasons that could leak internal control text.
 */
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
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('consumes the authorization code on failed PKCE so the same code cannot be replayed', function (): void {
    [$code, $verifier] = issue29AuthorizationCode('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => 'wrong-verifier-'.Str::random(32),
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('consumes the authorization code on wrong redirect_uri so the same code cannot be replayed', function (): void {
    [$code, $verifier] = issue29AuthorizationCode('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/wrong/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('consumes the authorization code on wrong client_secret so the same code cannot be replayed', function (): void {
    [$code, $verifier] = issue29AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
        'client_secret' => 'wrong-secret-'.Str::random(8),
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
        'client_secret' => 'app-b-secret',
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('lets HTTP Basic credentials win over conflicting client_id and client_secret in the request body', function (): void {
    [$code, $verifier] = issue29AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');

    $response = test()->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/token', [
            'grant_type' => 'authorization_code',
            'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
            'code' => $code,
            'code_verifier' => $verifier,
            'client_id' => 'app-a',
            'client_secret' => 'wrong-secret-from-body',
        ])->assertOk();

    expect($response->json('token_type'))->toBe('Bearer');
});

it('rejects exchanges where HTTP Basic credentials are wrong even if the body holds the right client', function (): void {
    [$code, $verifier] = issue29AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');

    test()->withHeader('Authorization', 'Basic '.base64_encode('app-b:wrong-from-header'))
        ->postJson('/token', [
            'grant_type' => 'authorization_code',
            'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
            'code' => $code,
            'code_verifier' => $verifier,
            'client_id' => 'app-b',
            'client_secret' => 'app-b-secret',
        ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');
});

it('returns a safe error_description that never carries raw exception or scope text on token failures', function (): void {
    $response = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => 'unknown-code-'.Str::random(16),
        'code_verifier' => 'wrong-verifier-'.Str::random(32),
    ])->assertStatus(400);

    $description = (string) $response->json('error_description');

    expect($description)
        ->toBeString()
        ->not->toContain('Exception')
        ->not->toContain('Throwable')
        ->not->toContain('SQLSTATE')
        ->not->toContain('Stack trace')
        ->not->toContain('#0')
        ->not->toContain('app/')
        ->not->toContain('vendor/');
});

/**
 * @return array{0: string, 1: string}
 */
function issue29AuthorizationCode(string $clientId, string $redirectUri): array
{
    [$user, $sessionId] = issue29BrowserSessionUser();
    [$verifier, $challenge] = issue29PkcePair();

    $response = test()
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access',
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $response->assertRedirect();
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['code'] ?? null)->toBeString()->not->toBe('');

    return [(string) $query['code'], $verifier];
}

/**
 * @return array{0: User, 1: string}
 */
function issue29BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue29-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AuthorizationCodeExchangeEdgeContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue29PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
