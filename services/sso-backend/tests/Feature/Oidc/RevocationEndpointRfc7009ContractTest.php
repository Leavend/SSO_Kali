<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\SigningKeyService;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\DB;
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
});

it('publishes the revocation endpoint in discovery metadata', function (): void {
    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertJsonPath('revocation_endpoint', 'https://api-sso.timeh.my.id/oauth/revoke')
        ->assertJsonPath('token_endpoint_auth_methods_supported', fn (array $methods): bool => in_array('client_secret_post', $methods, true));
});

it('revokes refresh tokens idempotently with rfc7009 empty success responses', function (): void {
    $tokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $first = $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ]);

    $first->assertOk()->assertExactJson([]);
    expect((string) $first->headers->get('Cache-Control'))->toContain('no-store');

    $record = issue52RefreshRecord($tokens['refresh_token']);
    expect($record->revoked_at)->not->toBeNull();

    $second = $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ]);

    $second->assertOk()->assertExactJson([]);
});

it('revokes access tokens by jti and makes them unusable for guarded resources', function (): void {
    $tokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $claims = app(SigningKeyService::class)->decode($tokens['access_token']);

    $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => $tokens['access_token'],
        'token_type_hint' => 'access_token',
    ])->assertOk()
        ->assertExactJson([]);

    expect(app(AccessTokenRevocationStore::class)->revoked((string) $claims['jti']))->toBeTrue()
        ->and(fn () => app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']))->toThrow(RuntimeException::class);
});

it('supports hint-less revocation for refresh and access tokens', function (): void {
    $refreshTokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $accessTokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $accessClaims = app(SigningKeyService::class)->decode($accessTokens['access_token']);

    $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => $refreshTokens['refresh_token'],
    ])->assertOk();

    $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => $accessTokens['access_token'],
    ])->assertOk();

    expect(issue52RefreshRecord($refreshTokens['refresh_token'])->revoked_at)->not->toBeNull()
        ->and(app(AccessTokenRevocationStore::class)->revoked((string) $accessClaims['jti']))->toBeTrue();
});

it('keeps unknown malformed and mismatched tokens idempotent without revoking active client tokens', function (): void {
    $tokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->postJson('/revocation', [
        'client_id' => 'app-a',
        'token' => 'unknown-token',
        'token_type_hint' => 'access_token',
    ])->assertOk()
        ->assertExactJson([]);

    $this->postJson('/revocation', [
        'client_id' => 'app-b',
        'client_secret' => 'app-b-secret',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk()
        ->assertExactJson([]);

    expect(issue52RefreshRecord($tokens['refresh_token'])->revoked_at)->toBeNull();
});

it('requires confidential client secret before revoking confidential-client tokens', function (): void {
    $tokens = issue52TokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', clientSecret: 'app-b-secret');

    $this->postJson('/revocation', [
        'client_id' => 'app-b',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk()
        ->assertExactJson([]);

    $this->postJson('/revocation', [
        'client_id' => 'app-b',
        'client_secret' => 'wrong-secret',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk()
        ->assertExactJson([]);

    expect(issue52RefreshRecord($tokens['refresh_token'])->revoked_at)->toBeNull();

    $this->postJson('/revocation', [
        'client_id' => 'app-b',
        'client_secret' => 'app-b-secret',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk()
        ->assertExactJson([]);

    expect(issue52RefreshRecord($tokens['refresh_token'])->revoked_at)->not->toBeNull();
});

it('supports the oauth2 prefixed revocation endpoint alias', function (): void {
    $tokens = issue52TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->postJson('/oauth2/revocation', [
        'client_id' => 'app-a',
        'token' => $tokens['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk()
        ->assertExactJson([]);

    expect(issue52RefreshRecord($tokens['refresh_token'])->revoked_at)->not->toBeNull();
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue52TokenSet(string $clientId, string $redirectUri, ?string $clientSecret = null): array
{
    [$user, $sessionId] = issue52BrowserSessionUser();
    [$verifier, $challenge] = issue52PkcePair();

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
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access',
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $authorize->assertRedirect();
    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    $payload = [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'code' => (string) $query['code'],
        'code_verifier' => $verifier,
    ];

    if ($clientSecret !== null) {
        $payload['client_secret'] = $clientSecret;
    }

    $token = test()->postJson('/token', $payload)->assertOk();

    return [
        'access_token' => (string) $token->json('access_token'),
        'id_token' => (string) $token->json('id_token'),
        'refresh_token' => (string) $token->json('refresh_token'),
    ];
}

function issue52RefreshRecord(string $plainToken): object
{
    $tokenId = issue52RefreshTokenId($plainToken);
    $record = DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->first();

    expect($record)->not->toBeNull();

    return $record;
}

function issue52RefreshTokenId(string $plainToken): string
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return $parts[0];
}

/**
 * @return array{0: User, 1: string}
 */
function issue52BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue52-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'RevocationEndpointContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue52PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
