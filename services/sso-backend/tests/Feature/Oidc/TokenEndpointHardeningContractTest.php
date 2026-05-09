<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

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
});

it('allows public clients to exchange a valid authorization code without a client secret', function (): void {
    [$code, $verifier] = issue49AuthorizationCode('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer')
        ->assertJsonStructure(['access_token', 'id_token', 'refresh_token', 'expires_in']);
});

it('requires confidential clients to provide the exact client secret', function (): void {
    [$missingSecretCode, $missingSecretVerifier] = issue49AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');
    [$wrongSecretCode, $wrongSecretVerifier] = issue49AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');
    [$validCode, $validVerifier] = issue49AuthorizationCode('app-b', 'https://sso.timeh.my.id/app-b/auth/callback');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => $missingSecretCode,
        'code_verifier' => $missingSecretVerifier,
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => $wrongSecretCode,
        'code_verifier' => $wrongSecretVerifier,
        'client_secret' => 'wrong-secret',
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => $validCode,
        'code_verifier' => $validVerifier,
        'client_secret' => 'app-b-secret',
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer');
});

it('rejects authorization code token exchange with invalid grants', function (array $overrides): void {
    [$code, $verifier] = issue49AuthorizationCode('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
        ...$overrides,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
})->with([
    'unknown code' => [['code' => 'unknown-code']],
    'missing code' => [['code' => '']],
    'missing verifier' => [['code_verifier' => '']],
    'wrong verifier' => [['code_verifier' => 'wrong-verifier']],
    'wrong redirect uri' => [['redirect_uri' => 'https://sso.timeh.my.id/app-a/wrong/callback']],
    'wrong client id' => [['client_id' => 'app-b', 'client_secret' => 'app-b-secret']],
]);

it('rejects authorization code replay after successful exchange', function (): void {
    [$code, $verifier] = issue49AuthorizationCode('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $payload = [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ];

    $this->postJson('/token', $payload)->assertOk();

    $this->postJson('/token', $payload)
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('rejects unsupported grant types with the oauth error contract', function (): void {
    $this->postJson('/token', [
        'grant_type' => 'password',
        'client_id' => 'app-a',
    ])->assertStatus(400)
        ->assertJsonPath('error', 'unsupported_grant_type');
});

it('rejects refresh grants with missing unknown or client-mismatched refresh tokens', function (array $payload): void {
    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => 'rt_unknown',
        ...$payload,
    ])->assertStatus($payload['expected_status'] ?? 400)
        ->assertJsonPath('error', $payload['expected_error'] ?? 'invalid_grant');
})->with([
    'unknown token for public client' => [[]],
    'missing token for public client' => [['refresh_token' => '']],
    'confidential client missing secret' => [['client_id' => 'app-b', 'expected_status' => 401, 'expected_error' => 'invalid_client']],
    'confidential client wrong secret' => [['client_id' => 'app-b', 'client_secret' => 'wrong-secret', 'expected_status' => 401, 'expected_error' => 'invalid_client']],
]);

it('returns no-store cache directives for token endpoint errors', function (): void {
    $response = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => 'unknown-code',
        'code_verifier' => 'wrong-verifier',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');
});

/**
 * @return array{0: string, 1: string}
 */
function issue49AuthorizationCode(string $clientId, string $redirectUri): array
{
    [$user, $sessionId] = issue49BrowserSessionUser();
    [$verifier, $challenge] = issue49PkcePair();

    $response = test()
        ->withSession([
            'broker_browser_session' => [
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
function issue49BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue49-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'TokenEndpointHardeningContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue49PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
