<?php

declare(strict_types=1);

use App\Exceptions\RefreshTokenRotationConflict;
use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\RefreshTokenReuseDetectedNotification;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * BE-FR032-001 + BE-FR033-001 — Atomic Refresh Rotation + Reuse Notification.
 *
 * Locks the missing edges that the existing refresh contracts did not
 * exercise:
 *
 *   1. Concurrent rotation against the same refresh token row resolves
 *      to exactly one success and a deterministic invalid_grant for
 *      the loser, via {@see RefreshTokenStore::rotateAtomic()} +
 *      {@see RefreshTokenRotationConflict}.
 *   2. Reuse detection emits a queued
 *      {@see RefreshTokenReuseDetectedNotification} to the affected
 *      user (in addition to the already-asserted audit + incident).
 *   3. The notification feature flag is honored — when
 *      `security-notifications.enabled` is false, no notification is
 *      sent but the audit row still lands.
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');
    config()->set('security-notifications.enabled', true);

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('atomically claims the row so a duplicate rotation against the same token raises a conflict', function (): void {
    $tokens = atomicRotationTokenSet();
    [$tokenId, $secret] = atomicRotationParseToken($tokens['refresh_token']);

    $store = app(RefreshTokenStore::class);
    $resolved = $store->resolveActive($tokens['refresh_token'], 'app-a');

    expect($resolved['record'])->not->toBeNull();

    // First call wins the row UPDATE — issues a replacement token.
    $first = app(LocalTokenService::class)->rotate($resolved['record'], [
        'client_id' => 'app-a',
        'scope' => $resolved['record']['scope'],
        'session_id' => $resolved['record']['session_id'],
        'subject_id' => $resolved['record']['subject_id'],
        'auth_time' => $resolved['record']['auth_time'],
        'amr' => $resolved['record']['amr'],
        'acr' => $resolved['record']['acr'],
        'upstream_refresh_token' => null,
    ]);

    expect($first['refresh_token'])->toBeString()->not->toBe($tokens['refresh_token']);

    // The loser sees the row as already-revoked and raises the conflict.
    expect(fn () => app(LocalTokenService::class)->rotate($resolved['record'], [
        'client_id' => 'app-a',
        'scope' => $resolved['record']['scope'],
        'session_id' => $resolved['record']['session_id'],
        'subject_id' => $resolved['record']['subject_id'],
        'auth_time' => $resolved['record']['auth_time'],
        'amr' => $resolved['record']['amr'],
        'acr' => $resolved['record']['acr'],
        'upstream_refresh_token' => null,
    ]))->toThrow(RefreshTokenRotationConflict::class);
});

it('queues a refresh_token_reuse_detected notification to the affected user when reuse trips', function (): void {
    Notification::fake();

    $tokens = atomicRotationTokenSet();
    [$tokenId] = atomicRotationParseToken($tokens['refresh_token']);
    $familyId = (string) DB::table('refresh_token_rotations')
        ->where('refresh_token_id', $tokenId)
        ->value('token_family_id');
    $subjectId = (string) DB::table('refresh_token_rotations')
        ->where('refresh_token_id', $tokenId)
        ->value('subject_id');

    // First refresh succeeds.
    test()->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertOk();

    // Second presentation = replay → reuse detected.
    test()->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertStatus(400);

    $user = User::query()->where('subject_id', $subjectId)->firstOrFail();

    Notification::assertSentTo(
        $user,
        RefreshTokenReuseDetectedNotification::class,
    );

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'refresh_token_reuse_detected')
        ->latest('id')
        ->firstOrFail();

    expect($event->context['token_family_hash'] ?? null)->toBe(hash('sha256', $familyId));
});

it('honors the security-notifications feature flag and skips the notification when disabled', function (): void {
    Notification::fake();
    config()->set('security-notifications.enabled', false);

    $tokens = atomicRotationTokenSet();

    test()->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertOk();

    test()->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertStatus(400);

    Notification::assertNothingSent();

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'refresh_token_reuse_detected')
        ->count())->toBe(1);
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function atomicRotationTokenSet(): array
{
    $clientId = 'app-a';
    $redirectUri = 'https://sso.timeh.my.id/app-a/auth/callback';

    [$user, $sessionId] = atomicRotationBrowserSessionUser();
    [$verifier, $challenge] = atomicRotationPkcePair();

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

/**
 * @return array{0: string, 1: string}
 */
function atomicRotationParseToken(string $plainToken): array
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return [$parts[0], $parts[1]];
}

/**
 * @return array{0: User, 1: string}
 */
function atomicRotationBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'atomic-rotation-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AtomicRefreshRotationContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function atomicRotationPkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
