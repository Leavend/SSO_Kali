<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.redirect_uri', 'https://api-sso.timeh.my.id/auth/oidc/callback');
    config()->set('sso.broker.public_issuer', 'https://accounts.example.test');
    config()->set('sso.broker.internal_issuer', 'https://accounts.internal.test');
    config()->set('sso.broker.scope', 'openid profile email');
    config()->set('sso.admin.panel_client_id', 'high-assurance-admin');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
        'high-assurance-admin' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('admin-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/admin/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/admin'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'high_assurance' => true,
        ],
    ]);

    Cache::flush();
});

it('uses an existing browser session for silent authorization when consent is not requested', function (): void {
    [$user, $sessionId] = issue55BrowserSessionUser('issue55-silent@example.test');
    [$verifier, $challenge] = issue55PkcePair();

    $response = issue55Authorize([
        'code_challenge' => $challenge,
    ], $user, $sessionId);

    $response->assertRedirect();
    $callback = issue55CallbackQuery($response->headers->get('Location'));

    expect($callback)->toHaveKey('code')
        ->and($callback)->toHaveKey('state', 'state-issue55')
        ->and($callback)->toHaveKey('iss', 'https://api-sso.timeh.my.id');

    test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => (string) $callback['code'],
        'code_verifier' => $verifier,
    ])->assertOk();
});

it('forces upstream interaction when prompt consent is requested despite an existing browser session', function (): void {
    [$user, $sessionId] = issue55BrowserSessionUser('issue55-consent@example.test');
    [, $challenge] = issue55PkcePair();

    $response = issue55Authorize([
        'prompt' => 'consent',
        'code_challenge' => $challenge,
    ], $user, $sessionId);

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');
    $query = issue55CallbackQuery($location);

    expect($location)->toStartWith('https://accounts.example.test/oauth/v2/authorize?')
        ->and($query)->toHaveKey('prompt', 'consent')
        ->and($query)->toHaveKey('state')
        ->and($query)->not->toHaveKey('code');
});

it('forces upstream account selection when prompt select_account is requested', function (): void {
    [$user, $sessionId] = issue55BrowserSessionUser('issue55-select@example.test');
    [, $challenge] = issue55PkcePair();

    $response = issue55Authorize([
        'prompt' => 'select_account',
        'code_challenge' => $challenge,
    ], $user, $sessionId);

    $response->assertRedirect();
    $query = issue55CallbackQuery($response->headers->get('Location'));

    expect($query)->toHaveKey('prompt', 'select_account')
        ->and($query)->not->toHaveKey('code');
});

it('returns login_required to the client when prompt none cannot be satisfied silently', function (): void {
    [, $challenge] = issue55PkcePair();

    $response = issue55Authorize([
        'prompt' => 'none',
        'code_challenge' => $challenge,
    ], null, null);

    $response->assertRedirect();
    $query = issue55CallbackQuery($response->headers->get('Location'));

    expect((string) $response->headers->get('Location'))->toStartWith('https://sso.timeh.my.id/app-a/auth/callback?')
        ->and($query)->toHaveKey('error', 'login_required')
        ->and($query)->toHaveKey('state', 'state-issue55')
        ->and($query)->not->toHaveKey('code');
});

it('rejects unsupported prompt values before creating an upstream request', function (): void {
    [, $challenge] = issue55PkcePair();

    issue55Authorize([
        'prompt' => 'create',
        'code_challenge' => $challenge,
    ], null, null)
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request')
        ->assertJsonPath('error_description', 'Unsupported prompt value.');
});

it('forces high assurance clients through upstream interaction even without prompt consent', function (): void {
    [$user, $sessionId] = issue55BrowserSessionUser('issue55-admin@example.test');
    [, $challenge] = issue55PkcePair();

    $response = issue55Authorize([
        'client_id' => 'high-assurance-admin',
        'redirect_uri' => 'https://sso.timeh.my.id/admin/auth/callback',
        'scope' => 'openid profile email',
        'code_challenge' => $challenge,
    ], $user, $sessionId);

    $response->assertRedirect();
    $query = issue55CallbackQuery($response->headers->get('Location'));

    expect((string) $response->headers->get('Location'))->toStartWith('https://accounts.example.test/oauth/v2/authorize?')
        ->and($query)->toHaveKey('prompt', 'login')
        ->and($query)->not->toHaveKey('code');
});

/**
 * @return array{0: User, 1: string}
 */
function issue55BrowserSessionUser(string $email): array
{
    $user = User::factory()->create(['email' => $email]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'ConsentFlowContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue55PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

function issue55Authorize(array $parameters, ?User $user, ?string $sessionId): TestResponse
{
    $query = [
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => 'state-issue55',
        'nonce' => 'nonce-issue55',
        'code_challenge_method' => 'S256',
        ...$parameters,
    ];

    $request = test();

    if ($user instanceof User && $sessionId !== null) {
        $request = $request->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ]);
    }

    return $request->get('/authorize?'.http_build_query($query));
}

/**
 * @return array<string, string>
 */
function issue55CallbackQuery(?string $location): array
{
    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);

    return array_map(static fn (mixed $value): string => (string) $value, $query);
}
