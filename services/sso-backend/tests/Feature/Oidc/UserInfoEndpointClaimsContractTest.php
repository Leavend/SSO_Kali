<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
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

it('returns OIDC standard profile and email claims for a valid bearer access token', function (): void {
    $tokens = issue53TokenSet('openid profile email offline_access');
    $claims = app(SigningKeyService::class)->decode($tokens['access_token']);

    $this->withToken($tokens['access_token'])
        ->getJson('/userinfo')
        ->assertOk()
        ->assertJsonPath('sub', $claims['sub'])
        ->assertJsonPath('name', $claims['name'])
        ->assertJsonPath('given_name', $claims['given_name'])
        ->assertJsonPath('family_name', $claims['family_name'])
        ->assertJsonPath('email', $claims['email'])
        ->assertJsonPath('email_verified', true)
        ->assertJsonMissingPath('scope')
        ->assertJsonMissingPath('client_id')
        ->assertJsonMissingPath('jti')
        ->assertJsonMissingPath('sid');
});

it('keeps userinfo profile email roles and permission claims scope-bound', function (): void {
    $tokens = issue53TokenSet('openid offline_access');

    $response = $this->withToken($tokens['access_token'])
        ->getJson('/userinfo')
        ->assertOk()
        ->assertJsonStructure(['sub']);

    foreach (['name', 'given_name', 'family_name', 'email', 'email_verified', 'roles', 'permissions'] as $claim) {
        $response->assertJsonMissingPath($claim);
    }
});

it('returns identical claims for GET and POST userinfo requests', function (): void {
    $tokens = issue53TokenSet('openid profile email offline_access');

    $get = $this->withToken($tokens['access_token'])->getJson('/userinfo')->assertOk()->json();
    $post = $this->withToken($tokens['access_token'])->postJson('/userinfo')->assertOk()->json();

    expect($post)->toBe($get);
});

it('rejects missing invalid tampered and id tokens with invalid_token errors', function (?string $token): void {
    $request = $this;
    if ($token !== null) {
        $request = $request->withToken($token);
    }

    $response = $request->getJson('/userinfo');

    $response->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');
})->with([
    'missing bearer token' => [null],
    'malformed token' => ['not-a-jwt'],
    'tampered token' => [fn (): string => issue53TamperedAccessToken()],
    'id token instead of access token' => [fn (): string => issue53TokenSet('openid profile email offline_access')['id_token']],
]);

it('rejects revoked access tokens from userinfo', function (): void {
    $tokens = issue53TokenSet('openid profile email offline_access');
    $claims = app(SigningKeyService::class)->decode($tokens['access_token']);

    app(AccessTokenRevocationStore::class)->revoke((string) $claims['jti'], 900);

    $this->withToken($tokens['access_token'])
        ->getJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('rejects access tokens with invalid issuer audience and unknown client binding', function (array $overrides): void {
    $token = app(SigningKeyService::class)->sign(issue53AccessClaims($overrides));

    $this->withToken($token)
        ->getJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
})->with([
    'invalid issuer' => [['iss' => 'https://evil.example.test']],
    'invalid audience' => [['aud' => 'wrong-api']],
    'unknown client' => [['client_id' => 'deleted-client']],
]);

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue53TokenSet(string $scope): array
{
    [$user, $sessionId] = issue53BrowserSessionUser();
    [$verifier, $challenge] = issue53PkcePair();

    $authorize = test()
        ->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => 'app-a',
            'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
            'response_type' => 'code',
            'scope' => $scope,
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $authorize->assertRedirect();
    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    $token = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => (string) $query['code'],
        'code_verifier' => $verifier,
    ])->assertOk();

    return [
        'access_token' => (string) $token->json('access_token'),
        'id_token' => (string) $token->json('id_token'),
        'refresh_token' => (string) $token->json('refresh_token'),
    ];
}

function issue53TamperedAccessToken(): string
{
    $token = issue53TokenSet('openid profile email offline_access')['access_token'];
    $parts = explode('.', $token);
    $parts[1] = issue53Base64UrlEncode(json_encode([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => 'tampered-subject',
        'client_id' => 'app-a',
        'token_use' => 'access',
        'scope' => 'openid profile email',
        'jti' => (string) Str::uuid(),
        'sid' => (string) Str::uuid(),
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ], JSON_THROW_ON_ERROR));

    return implode('.', $parts);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function issue53AccessClaims(array $overrides = []): array
{
    return [
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => 'issue53-subject',
        'client_id' => 'app-a',
        'token_use' => 'access',
        'scope' => 'openid profile email',
        'jti' => (string) Str::uuid(),
        'sid' => (string) Str::uuid(),
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
        ...$overrides,
    ];
}

/**
 * @return array{0: User, 1: string}
 */
function issue53BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue53-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Issue53UserInfoClaimsContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue53PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

function issue53Base64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}
