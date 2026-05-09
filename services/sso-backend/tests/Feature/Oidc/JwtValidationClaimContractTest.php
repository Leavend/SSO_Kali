<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\SigningKeyService;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

beforeEach(function (): void {
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
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
        ],
    ]);
});

it('issues access and id tokens with production jwt claims and scope-bound profile claims', function (): void {
    $tokens = issue50Tokens(
        clientId: 'app-a',
        redirectUri: 'https://sso.timeh.my.id/app-a/auth/callback',
        scope: 'openid profile email offline_access',
        nonce: 'nonce-'.Str::random(24),
        authTime: now()->subMinutes(2)->timestamp,
        amr: ['pwd', 'mfa'],
    );

    $accessClaims = app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']);
    $idClaims = app(SigningKeyService::class)->decode($tokens['id_token']);

    expect($accessClaims['iss'] ?? null)->toBe('https://api-sso.timeh.my.id')
        ->and($accessClaims['aud'] ?? null)->toBe('sso-api')
        ->and($accessClaims['client_id'] ?? null)->toBe('app-a')
        ->and($accessClaims['token_use'] ?? null)->toBe('access')
        ->and($accessClaims['jti'] ?? null)->toBeString()->not->toBe('')
        ->and($accessClaims['sid'] ?? null)->toBeString()->not->toBe('')
        ->and($accessClaims['scope'] ?? null)->toBe('openid profile email offline_access')
        ->and($accessClaims['name'] ?? null)->toBeString()->not->toBe('')
        ->and($accessClaims['email'] ?? null)->toBeString()->not->toBe('')
        ->and($accessClaims['email_verified'] ?? null)->toBeTrue()
        ->and($accessClaims['auth_time'] ?? null)->toBeInt()
        ->and($accessClaims['amr'] ?? null)->toBe(['pwd', 'mfa'])
        ->and($accessClaims['exp'] ?? 0)->toBeGreaterThan(time())
        ->and($accessClaims['iat'] ?? 0)->toBeLessThanOrEqual(time() + 60);

    expect($idClaims['iss'] ?? null)->toBe('https://api-sso.timeh.my.id')
        ->and($idClaims['aud'] ?? null)->toBe('app-a')
        ->and($idClaims['azp'] ?? null)->toBe('app-a')
        ->and($idClaims['token_use'] ?? null)->toBe('id')
        ->and($idClaims['nonce'] ?? null)->toBe($tokens['nonce'])
        ->and($idClaims['sid'] ?? null)->toBe($accessClaims['sid'])
        ->and($idClaims['sub'] ?? null)->toBe($accessClaims['sub'])
        ->and($idClaims['auth_time'] ?? null)->toBe($accessClaims['auth_time'])
        ->and($idClaims['amr'] ?? null)->toBe(['pwd', 'mfa']);
});

it('keeps profile email roles and permission claims hidden unless their scopes are granted', function (): void {
    $tokens = issue50Tokens(
        clientId: 'app-a',
        redirectUri: 'https://sso.timeh.my.id/app-a/auth/callback',
        scope: 'openid offline_access',
        nonce: 'nonce-'.Str::random(24),
    );

    $accessClaims = app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']);
    $idClaims = app(SigningKeyService::class)->decode($tokens['id_token']);

    foreach (['name', 'given_name', 'family_name', 'email', 'email_verified', 'roles', 'permissions'] as $claim) {
        expect($accessClaims)->not->toHaveKey($claim)
            ->and($idClaims)->not->toHaveKey($claim);
    }
});

it('rejects access tokens with invalid issuer audience expiry token use required claims or active client binding', function (array $overrides): void {
    $claims = issue50AccessClaims($overrides);
    $token = app(SigningKeyService::class)->sign($claims);

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($token))->toThrow(RuntimeException::class);
})->with([
    'invalid issuer' => [['iss' => 'https://evil.example.test']],
    'invalid audience' => [['aud' => 'wrong-api']],
    'expired token' => [['exp' => time() - 120]],
    'future issued-at' => [['iat' => time() + 120, 'nbf' => time()]],
    'id token used as access token' => [['token_use' => 'id']],
    'missing jti' => [['jti' => null]],
    'missing sid' => [['sid' => null]],
    'unknown client' => [['client_id' => 'deleted-client']],
]);

it('rejects tampered signed tokens and unsigned alg none tokens', function (): void {
    $validToken = app(SigningKeyService::class)->sign(issue50AccessClaims());
    $parts = explode('.', $validToken);
    $parts[1] = issue50Base64UrlEncode(json_encode([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => 'tampered-subject',
        'client_id' => 'app-a',
        'token_use' => 'access',
        'scope' => 'openid',
        'jti' => (string) Str::uuid(),
        'sid' => (string) Str::uuid(),
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ], JSON_THROW_ON_ERROR));

    $tamperedToken = implode('.', $parts);
    $algNoneToken = issue50Base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'none'], JSON_THROW_ON_ERROR))
        .'.'.issue50Base64UrlEncode(json_encode(issue50AccessClaims(), JSON_THROW_ON_ERROR)).'.';

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($tamperedToken))->toThrow(RuntimeException::class)
        ->and(fn () => app(AccessTokenGuard::class)->claimsFrom($algNoneToken))->toThrow(RuntimeException::class);
});

it('rejects access tokens after their jti is revoked', function (): void {
    $token = app(SigningKeyService::class)->sign(issue50AccessClaims(['jti' => 'issue50-revoked-jti']));

    app(AccessTokenRevocationStore::class)->revoke('issue50-revoked-jti', 900);

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($token))->toThrow(RuntimeException::class);
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string, nonce: string}
 */
function issue50Tokens(string $clientId, string $redirectUri, string $scope, string $nonce, ?int $authTime = null, array $amr = ['pwd']): array
{
    [$user, $sessionId] = issue50BrowserSessionUser();
    [$verifier, $challenge] = issue50PkcePair();

    $response = test()
        ->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => $authTime ?? time(),
                'amr' => $amr,
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $scope,
            'state' => 'state-'.Str::random(24),
            'nonce' => $nonce,
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
        'nonce' => $nonce,
    ];
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function issue50AccessClaims(array $overrides = []): array
{
    return array_filter([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => 'issue50-subject',
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
function issue50BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue50-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'JwtValidationClaimContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue50PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

function issue50Base64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}
