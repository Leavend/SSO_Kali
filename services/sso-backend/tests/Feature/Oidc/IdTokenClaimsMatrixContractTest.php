<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use App\Support\Oidc\OidcScope;
use Firebase\JWT\JWT;
use Illuminate\Support\Str;

/**
 * BE-FR030-001 — ID Token Claim Matrix Evidence.
 *
 * Locks the table-driven matrix of ID token claims so RP validation
 * has a single, machine-checked source of truth:
 *
 *   1. Core claims (`iss`, `aud`, `sub`, `iat`, `exp`, `nonce`, `sid`,
 *      `azp`, `nbf`, `jti`) appear on every ID token.
 *   2. Profile, email, roles, and permission claims appear only when
 *      the corresponding scope is granted.
 *   3. `auth_time`, `amr`, and `acr` reflect MFA / step-up assurance.
 *   4. The signed JWT header advertises an alg + kid that match the
 *      JWKS document so RPs that resolve keys via JWKS can validate
 *      the signature.
 */
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
            'allowed_scopes' => [
                'openid', 'profile', 'email', 'offline_access',
                OidcScope::ROLES,
                OidcScope::PERMISSIONS,
            ],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it(
    'emits the documented ID token claim matrix per scope grant',
    function (string $scope, array $expected, array $forbidden): void {
        $tokens = issue30Tokens('app-a', 'https://sso.timeh.my.id/app-a/auth/callback', $scope);
        $idClaims = app(SigningKeyService::class)->decode($tokens['id_token']);

        // Core claims always present on every ID token regardless of scope.
        expect($idClaims['iss'] ?? null)->toBe('https://api-sso.timeh.my.id')
            ->and($idClaims['aud'] ?? null)->toBe('app-a')
            ->and($idClaims['azp'] ?? null)->toBe('app-a')
            ->and($idClaims['sub'] ?? null)->toBeString()->not->toBe('')
            ->and($idClaims['sid'] ?? null)->toBeString()->not->toBe('')
            ->and($idClaims['nonce'] ?? null)->toBe($tokens['nonce'])
            ->and($idClaims['iat'] ?? null)->toBeInt()
            ->and($idClaims['nbf'] ?? null)->toBeInt()
            ->and($idClaims['exp'] ?? 0)->toBeGreaterThan(time())
            ->and($idClaims['jti'] ?? null)->toBeString()->not->toBe('')
            ->and($idClaims['token_use'] ?? null)->toBe('id');

        foreach ($expected as $claim) {
            expect($idClaims)->toHaveKey($claim);
        }

        foreach ($forbidden as $claim) {
            expect($idClaims)->not->toHaveKey($claim);
        }
    },
)->with([
    'openid only' => [
        'openid',
        ['iss', 'aud', 'sub'],
        ['name', 'given_name', 'family_name', 'email', 'email_verified', 'roles', 'permissions'],
    ],
    'openid + profile' => [
        'openid profile',
        ['name', 'given_name', 'family_name'],
        ['email', 'email_verified', 'roles', 'permissions'],
    ],
    'openid + email' => [
        'openid email',
        ['email', 'email_verified'],
        ['name', 'given_name', 'family_name', 'roles', 'permissions'],
    ],
    'openid + roles' => [
        'openid '.OidcScope::ROLES,
        ['roles'],
        ['email', 'permissions'],
    ],
    'openid + permissions' => [
        'openid '.OidcScope::PERMISSIONS,
        ['permissions'],
        ['email', 'roles'],
    ],
    'openid + profile + email + roles' => [
        'openid profile email '.OidcScope::ROLES,
        ['name', 'email', 'email_verified', 'roles'],
        ['permissions'],
    ],
]);

it('reflects MFA/step-up assurance in auth_time, amr, and acr claims', function (): void {
    $authTime = now()->subMinutes(2)->timestamp;
    $tokens = issue30Tokens(
        clientId: 'app-a',
        redirectUri: 'https://sso.timeh.my.id/app-a/auth/callback',
        scope: 'openid profile email offline_access',
        amr: ['pwd', 'mfa'],
        acr: 'urn:sso:loa:mfa',
        authTime: $authTime,
    );

    $idClaims = app(SigningKeyService::class)->decode($tokens['id_token']);

    expect($idClaims['amr'] ?? [])->toEqualCanonicalizing(['pwd', 'mfa'])
        ->and($idClaims['acr'] ?? null)->toBe('urn:sso:loa:mfa')
        ->and($idClaims['auth_time'] ?? null)->toBe($authTime);
});

it('signs the ID token with an alg and kid that match the JWKS document', function (): void {
    $tokens = issue30Tokens('app-a', 'https://sso.timeh.my.id/app-a/auth/callback', 'openid profile');

    $jwks = test()->getJson('/.well-known/jwks.json')->assertOk()->json('keys');

    $header = json_decode(JWT::urlsafeB64Decode(explode('.', $tokens['id_token'])[0]), true, 512, JSON_THROW_ON_ERROR);

    expect($header['alg'] ?? null)
        ->toBeString()
        ->toBe(config('sso.signing.alg'))
        ->and($header['kid'] ?? null)
        ->toBeString()
        ->not->toBe('');

    $matchingKey = collect($jwks)->first(static fn (array $key): bool => ($key['kid'] ?? null) === $header['kid']);

    expect($matchingKey)->toBeArray()
        ->and($matchingKey['alg'] ?? null)->toBe($header['alg'])
        ->and($matchingKey['use'] ?? null)->toBe('sig');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string, nonce: string}
 */
function issue30Tokens(
    string $clientId,
    string $redirectUri,
    string $scope,
    array $amr = ['pwd'],
    ?string $acr = null,
    ?int $authTime = null,
): array {
    [$user, $sessionId] = issue30BrowserSessionUser();
    [$verifier, $challenge] = issue30PkcePair();
    $nonce = 'nonce-'.Str::random(24);

    if (in_array('mfa', $amr, true)) {
        MfaCredential::factory()->verified()->create(['user_id' => $user->id, 'method' => 'totp']);
    }

    $response = test()
        ->withSession([
            'sso_browser_session' => array_filter([
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => $authTime ?? time(),
                'amr' => $amr,
                'acr' => $acr,
            ], static fn (mixed $value): bool => $value !== null),
        ])
        ->get('/authorize?'.http_build_query(array_filter([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $scope,
            'state' => 'state-'.Str::random(24),
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
            'acr_values' => $acr,
        ], static fn (mixed $value): bool => $value !== null)));

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
 * @return array{0: User, 1: string}
 */
function issue30BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue30-'.Str::random(16).'@example.test']);

    $role = Role::query()->firstOrCreate(
        ['slug' => 'issue30-staff'],
        ['name' => 'issue30 staff']
    );
    $permission = Permission::query()->firstOrCreate(
        ['slug' => 'issue30.read'],
        ['name' => 'issue30 read', 'category' => 'issue30']
    );
    $role->permissions()->syncWithoutDetaching([$permission->id]);
    $user->roles()->syncWithoutDetaching([$role->id]);

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'IdTokenClaimsMatrixContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue30PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
