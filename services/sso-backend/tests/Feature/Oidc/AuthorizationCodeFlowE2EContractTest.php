<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

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

it('completes public client authorization code flow with pkce state nonce and single use code', function (): void {
    [$user, $sessionId] = issue48LoggedInUser('issue48-public@example.test');
    [$verifier, $challenge] = issue48PkcePair();
    $state = 'state-'.Str::random(24);
    $nonce = 'nonce-'.Str::random(24);

    $authorize = issue48AuthorizeWithBrowserSession($this, $user, $sessionId, [
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
    ]);

    $authorize->assertRedirect();
    $callback = issue48CallbackQuery($authorize->headers->get('Location'));

    expect($callback['state'] ?? null)->toBe($state)
        ->and($callback['code'] ?? null)->toBeString()->not->toBe('');

    $token = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer')
        ->assertJsonPath('scope', 'openid profile email offline_access')
        ->assertJsonStructure(['access_token', 'id_token', 'refresh_token', 'expires_in']);

    $idClaims = app(SigningKeyService::class)->decode((string) $token->json('id_token'));
    expect($idClaims['nonce'] ?? null)->toBe($nonce)
        ->and($idClaims['aud'] ?? null)->toBe('app-a')
        ->and($idClaims['iss'] ?? null)->toBe('https://api-sso.timeh.my.id');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('requires the confidential client secret before exchanging app b authorization codes', function (): void {
    [$user, $sessionId] = issue48LoggedInUser('issue48-confidential@example.test');
    [$verifier, $challenge] = issue48PkcePair();

    $authorize = issue48AuthorizeWithBrowserSession($this, $user, $sessionId, [
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'state' => 'state-'.Str::random(24),
        'nonce' => 'nonce-'.Str::random(24),
        'code_challenge' => $challenge,
    ]);

    $authorize->assertRedirect();
    $callback = issue48CallbackQuery($authorize->headers->get('Location'));

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
        'client_secret' => 'app-b-secret',
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('rejects authorization requests with unsafe or incomplete protocol parameters', function (array $overrides, string $error): void {
    [$user, $sessionId] = issue48LoggedInUser('issue48-invalid-'.Str::random(8).'@example.test');
    [, $challenge] = issue48PkcePair();

    $response = issue48AuthorizeWithBrowserSession($this, $user, $sessionId, [
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'state-'.Str::random(24),
        'nonce' => 'nonce-'.Str::random(24),
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        ...$overrides,
    ], false);

    $response->assertStatus(400)
        ->assertJsonPath('error', $error);

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');
})->with([
    'missing state' => [['state' => null], 'invalid_request'],
    'missing nonce' => [['nonce' => null], 'invalid_request'],
    'unsupported response type' => [['response_type' => 'token'], 'invalid_request'],
    'plain pkce rejected' => [['code_challenge_method' => 'plain'], 'invalid_request'],
    'missing code challenge' => [['code_challenge' => null], 'invalid_request'],
]);

it('rejects token exchange when pkce verifier redirect uri or client binding is wrong', function (array $overrides): void {
    [$user, $sessionId] = issue48LoggedInUser('issue48-binding-'.Str::random(8).'@example.test');
    [$verifier, $challenge] = issue48PkcePair();

    $authorize = issue48AuthorizeWithBrowserSession($this, $user, $sessionId, [
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'state' => 'state-'.Str::random(24),
        'nonce' => 'nonce-'.Str::random(24),
        'code_challenge' => $challenge,
    ]);

    $authorize->assertRedirect();
    $callback = issue48CallbackQuery($authorize->headers->get('Location'));

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
        ...$overrides,
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
})->with([
    'wrong pkce verifier' => [['code_verifier' => 'wrong-verifier']],
    'wrong redirect uri' => [['redirect_uri' => 'https://sso.timeh.my.id/app-a/wrong/callback']],
    'wrong client id' => [['client_id' => 'app-b', 'client_secret' => 'app-b-secret']],
]);

/**
 * @return array{0: User, 1: string}
 */
function issue48LoggedInUser(string $email): array
{
    $user = User::factory()->create(['email' => $email]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Issue48E2EContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue48PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

/**
 * @param  array<string, string|null>  $parameters
 */
function issue48AuthorizeWithBrowserSession(mixed $test, User $user, string $sessionId, array $parameters, bool $withDefaults = true): TestResponse
{
    $query = $withDefaults ? [
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'code_challenge_method' => 'S256',
    ] : [];

    $query = array_filter([...$query, ...$parameters], static fn (?string $value): bool => $value !== null);

    return $test
        ->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query($query));
}

/**
 * @return array<string, mixed>
 */
function issue48CallbackQuery(?string $location): array
{
    expect($location)->toBeString()->not->toBe('');

    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);

    return $query;
}
