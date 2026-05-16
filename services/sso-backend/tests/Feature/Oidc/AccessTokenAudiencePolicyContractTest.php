<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * BE-FR031-001 — Access Token Audience Policy Evidence.
 *
 * Documents and locks the MVP single-global-audience policy:
 *
 *   1. Every access token carries `aud === config('sso.resource_audience')`.
 *   2. The guard rejects tokens whose `aud` does not match the global
 *      configured value.
 *   3. The guard rejects tokens for inactive/decommissioned clients
 *      even when the signature, audience, and lifetime are otherwise
 *      valid (so removing a client revokes outstanding tokens at the
 *      resource boundary).
 *   4. UserInfo (the canonical resource server) honors the granted
 *      access scope — claims outside the requested scope are not
 *      released even though the token is otherwise valid.
 *
 * Multi-resource audience routing (per-API `aud` derived from client
 * policy) is intentionally NOT yet implemented. The README of this
 * contract is the matching comment block on `config/sso.php` so future
 * work has a single anchor.
 */
beforeEach(function (): void {
    app()->forgetInstance(SigningKeyService::class);
    app()->forgetInstance(AccessTokenGuard::class);
    app()->forgetInstance(AccessTokenRevocationStore::class);
    app()->forgetInstance(DownstreamClientRegistry::class);
    app()->forgetInstance(ResilientCacheStore::class);
    Cache::flush();

    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');
    config()->set('sso.jwt.clock_skew_seconds', 60);

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('issues access tokens whose aud is the configured global resource audience', function (): void {
    $tokens = issue31Tokens('app-a', 'https://sso.timeh.my.id/app-a/auth/callback', 'openid profile email offline_access');

    $accessClaims = app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']);

    expect($accessClaims['aud'] ?? null)->toBe('sso-api')
        ->and($accessClaims['aud'] ?? null)->toBe(config('sso.resource_audience'));
});

it('rejects access tokens whose audience does not match the configured global resource audience', function (): void {
    $token = app(SigningKeyService::class)->sign(issue31AccessClaims(['aud' => 'wrong-api']));

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($token))->toThrow(RuntimeException::class);
});

it('rejects access tokens for inactive / decommissioned clients even when otherwise valid', function (): void {
    $tokens = issue31Tokens('app-a', 'https://sso.timeh.my.id/app-a/auth/callback', 'openid profile email offline_access');

    config()->set('oidc_clients.clients', [
        // 'app-a' intentionally removed: simulates client decommission.
    ]);
    app(DownstreamClientRegistry::class)->flush();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']))
        ->toThrow(RuntimeException::class);
});

it('honors granted scope at UserInfo so a token without email scope cannot read email claims', function (): void {
    $tokens = issue31Tokens('app-a', 'https://sso.timeh.my.id/app-a/auth/callback', 'openid profile offline_access');

    $response = test()->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
        ->getJson('/userinfo')
        ->assertOk();

    $body = $response->json();

    expect($body)
        ->toHaveKey('sub')
        ->not->toHaveKey('email')
        ->not->toHaveKey('email_verified');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue31Tokens(string $clientId, string $redirectUri, string $scope): array
{
    [$user, $sessionId] = issue31BrowserSessionUser();
    [$verifier, $challenge] = issue31PkcePair();

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
            'scope' => $scope,
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $response->assertRedirect();
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    $tokenResponse = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'code' => (string) $query['code'],
        'code_verifier' => $verifier,
    ])->assertOk();

    return [
        'access_token' => (string) $tokenResponse->json('access_token'),
        'id_token' => (string) $tokenResponse->json('id_token'),
        'refresh_token' => (string) $tokenResponse->json('refresh_token'),
    ];
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function issue31AccessClaims(array $overrides = []): array
{
    return array_filter([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => 'issue31-subject',
        'client_id' => 'app-a',
        'token_use' => 'access',
        'scope' => 'openid profile email',
        'jti' => (string) Str::uuid(),
        'sid' => (string) Str::uuid(),
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
        ...$overrides,
    ], static fn (mixed $value): bool => $value !== null);
}

/**
 * @return array{0: User, 1: string}
 */
function issue31BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue31-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AccessTokenAudiencePolicyContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue31PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
