<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
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
    config()->set('sso.ttl.refresh_token_family_days', 90);

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

it('rotates refresh tokens and invalidates the previous token after each successful refresh', function (): void {
    $initial = issue51TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $initialRecord = issue51RefreshRecord($initial['refresh_token']);

    $rotated = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $initial['refresh_token'],
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer')
        ->assertJsonStructure(['access_token', 'id_token', 'refresh_token', 'expires_in'])
        ->json();

    expect($rotated['refresh_token'])->toBeString()->not->toBe($initial['refresh_token']);

    $rotatedRecord = issue51RefreshRecord((string) $rotated['refresh_token']);
    $oldRecord = issue51RefreshRecord($initial['refresh_token']);

    expect($rotatedRecord->token_family_id)->toBe($initialRecord->token_family_id)
        ->and($oldRecord->revoked_at)->not->toBeNull()
        ->and($oldRecord->replaced_by_token_id)->toBe($rotatedRecord->refresh_token_id);
});

it('detects replay of a rotated refresh token and revokes the entire token family', function (): void {
    $initial = issue51TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $rotated = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $initial['refresh_token'],
    ])->assertOk()->json();

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $initial['refresh_token'],
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => (string) $rotated['refresh_token'],
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    $records = DB::table('refresh_token_rotations')
        ->where('token_family_id', issue51RefreshRecord($initial['refresh_token'])->token_family_id)
        ->get();

    expect($records)->not->toBeEmpty();
    foreach ($records as $record) {
        expect($record->revoked_at)->not->toBeNull();
    }
});

it('preserves subject session scope auth context and claims across refresh rotation', function (): void {
    $initial = issue51TokenSet(
        clientId: 'app-a',
        redirectUri: 'https://sso.timeh.my.id/app-a/auth/callback',
        scope: 'openid profile email offline_access',
        authTime: now()->subMinutes(5)->timestamp,
        amr: ['pwd', 'mfa'],
    );

    $rotated = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $initial['refresh_token'],
    ])->assertOk()->json();

    $initialAccessClaims = app(SigningKeyService::class)->decode($initial['access_token']);
    $rotatedAccessClaims = app(SigningKeyService::class)->decode((string) $rotated['access_token']);
    $rotatedIdClaims = app(SigningKeyService::class)->decode((string) $rotated['id_token']);

    expect($rotatedAccessClaims['sub'] ?? null)->toBe($initialAccessClaims['sub'])
        ->and($rotatedAccessClaims['sid'] ?? null)->toBe($initialAccessClaims['sid'])
        ->and($rotatedAccessClaims['scope'] ?? null)->toBe('openid profile email offline_access')
        ->and($rotatedAccessClaims['auth_time'] ?? null)->toBe($initialAccessClaims['auth_time'])
        ->and($rotatedAccessClaims['amr'] ?? null)->toBe(['pwd', 'mfa'])
        ->and($rotatedAccessClaims['jti'] ?? null)->not->toBe($initialAccessClaims['jti'])
        ->and($rotatedIdClaims['sub'] ?? null)->toBe($initialAccessClaims['sub'])
        ->and($rotatedIdClaims['sid'] ?? null)->toBe($initialAccessClaims['sid']);
});

it('requires confidential client authentication before refresh rotation', function (): void {
    $initial = issue51TokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', clientSecret: 'app-b-secret');

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-b',
        'refresh_token' => $initial['refresh_token'],
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-b',
        'refresh_token' => $initial['refresh_token'],
        'client_secret' => 'wrong-secret',
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-b',
        'refresh_token' => $initial['refresh_token'],
        'client_secret' => 'app-b-secret',
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer');
});

it('rejects refresh token use by a different client without revoking the original family', function (): void {
    $initial = issue51TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $recordBefore = issue51RefreshRecord($initial['refresh_token']);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-b',
        'client_secret' => 'app-b-secret',
        'refresh_token' => $initial['refresh_token'],
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    $recordAfter = issue51RefreshRecord($initial['refresh_token']);

    expect($recordAfter->revoked_at)->toBeNull()
        ->and($recordAfter->token_family_id)->toBe($recordBefore->token_family_id);
});

it('revokes expired refresh token families and rejects the refresh grant', function (): void {
    $initial = issue51TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $record = issue51RefreshRecord($initial['refresh_token']);

    DB::table('refresh_token_rotations')
        ->where('token_family_id', $record->token_family_id)
        ->update([
            'family_created_at' => now()->subDays(91),
            'updated_at' => now(),
        ]);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $initial['refresh_token'],
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    $expiredRecord = issue51RefreshRecord($initial['refresh_token']);
    expect($expiredRecord->revoked_at)->not->toBeNull();
});

it('keeps invalid refresh-token errors non-cacheable', function (): void {
    $response = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => 'rt_unknown',
    ]);

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue51TokenSet(
    string $clientId,
    string $redirectUri,
    string $scope = 'openid profile email offline_access',
    ?int $authTime = null,
    array $amr = ['pwd'],
    ?string $clientSecret = null,
): array {
    [$user, $sessionId] = issue51BrowserSessionUser();
    [$verifier, $challenge] = issue51PkcePair();

    $authorize = test()
        ->withSession([
            'sso_browser_session' => [
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

function issue51RefreshRecord(string $plainToken): object
{
    [$tokenId] = issue51ParseRefreshToken($plainToken);

    $record = DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->first();
    expect($record)->not->toBeNull();

    return $record;
}

/**
 * @return array{0: string, 1: string}
 */
function issue51ParseRefreshToken(string $plainToken): array
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return [$parts[0], $parts[1]];
}

/**
 * @return array{0: User, 1: string}
 */
function issue51BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue51-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'RefreshTokenRotationContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue51PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
