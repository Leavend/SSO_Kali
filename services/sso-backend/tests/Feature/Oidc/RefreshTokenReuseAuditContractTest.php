<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
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
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('emits a refresh_token_reuse_detected audit event with family hash when a rotated token is replayed', function (): void {
    $tokens = refreshReuseTokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $tokenId = refreshReuseTokenId($tokens['refresh_token']);
    $familyId = (string) DB::table('refresh_token_rotations')
        ->where('refresh_token_id', $tokenId)
        ->value('token_family_id');

    // First rotation: succeeds and revokes the original token while issuing a
    // replacement.
    test()->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertOk();

    // Second presentation of the SAME (now-revoked) refresh token must trip
    // OAuth 2.1 §6.1 reuse detection and revoke the entire family.
    test()
        ->withHeader('X-Request-Id', 'req-refresh-replay-fr033')
        ->postJson('/token', [
            'grant_type' => 'refresh_token',
            'client_id' => 'app-a',
            'refresh_token' => $tokens['refresh_token'],
        ])->assertStatus(400);

    $reuseEvent = AuthenticationAuditEvent::query()
        ->where('event_type', 'refresh_token_reuse_detected')
        ->latest('id')
        ->first();

    expect($reuseEvent)->not->toBeNull()
        ->and($reuseEvent->outcome)->toBe('denied')
        ->and($reuseEvent->client_id)->toBe('app-a')
        ->and($reuseEvent->request_id)->toBe('req-refresh-replay-fr033')
        ->and($reuseEvent->context)->toMatchArray([
            'token_family_hash' => hash('sha256', $familyId),
            'token_id_hash' => hash('sha256', $tokenId),
        ])
        ->and(json_encode($reuseEvent->toArray(), JSON_THROW_ON_ERROR))
        ->not->toContain($tokens['refresh_token'])
        ->not->toContain($familyId)
        ->not->toContain($tokenId);

    $remainingActive = DB::table('refresh_token_rotations')
        ->where('token_family_id', $familyId)
        ->whereNull('revoked_at')
        ->count();

    expect($remainingActive)->toBe(0);
});

it('atomically claims the refresh token so a duplicate rotation cannot succeed against the same row', function (): void {
    $tokens = refreshReuseTokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $tokenId = refreshReuseTokenId($tokens['refresh_token']);

    // Force the row into a revoked state mid-flight: simulate a concurrent
    // rotation finishing first.
    DB::table('refresh_token_rotations')
        ->where('refresh_token_id', $tokenId)
        ->update([
            'revoked_at' => now(),
            'updated_at' => now(),
        ]);

    test()
        ->withHeader('X-Request-Id', 'req-refresh-concurrent-fr032')
        ->postJson('/token', [
            'grant_type' => 'refresh_token',
            'client_id' => 'app-a',
            'refresh_token' => $tokens['refresh_token'],
        ])->assertStatus(400);

    $rotated = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_refreshed')
        ->where('outcome', 'succeeded')
        ->where('request_id', 'req-refresh-concurrent-fr032')
        ->count();

    expect($rotated)->toBe(0);
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function refreshReuseTokenSet(string $clientId, string $redirectUri): array
{
    [$user, $sessionId] = refreshReuseBrowserSessionUser();
    [$verifier, $challenge] = refreshReusePkcePair();

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

    $token = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'code' => (string) $query['code'],
        'code_verifier' => $verifier,
    ])->assertOk();

    return [
        'access_token' => (string) $token->json('access_token'),
        'id_token' => (string) $token->json('id_token'),
        'refresh_token' => (string) $token->json('refresh_token'),
    ];
}

function refreshReuseTokenId(string $plainToken): string
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return $parts[0];
}

/**
 * @return array{0: User, 1: string}
 */
function refreshReuseBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'refresh-reuse-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'RefreshReuseAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function refreshReusePkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
