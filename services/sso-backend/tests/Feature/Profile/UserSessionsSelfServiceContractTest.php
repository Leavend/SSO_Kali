<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.ttl.refresh_token_days', 30);
    config()->set('oidc_clients.clients.app-a.display_name', 'Application A');
    config()->set('oidc_clients.clients.app-b.display_name', 'Application B');
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'offline_access']);
    config()->set('oidc_clients.clients.app-b.allowed_scopes', ['openid', 'profile', 'email', 'offline_access']);

    Cache::flush();
});

describe('GET /api/profile/sessions', function (): void {
    it('lists all active sessions across clients for the authenticated user', function (): void {
        $user = uc32User();
        uc32Tokens($user, 'app-a', 'uc32-session-a');
        uc32Tokens($user, 'app-b', 'uc32-session-a');
        uc32Tokens($user, 'app-a', 'uc32-session-b');

        $response = $this->getJson(
            '/api/profile/sessions',
            uc32AuthHeaders($user, 'app-a', 'uc32-session-a'),
        );

        $response->assertOk()
            ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private')
            ->assertHeader('Pragma', 'no-cache')
            ->assertJsonCount(2, 'sessions');

        $sessionIds = collect($response->json('sessions'))->pluck('session_id')->all();
        expect($sessionIds)->toEqualCanonicalizing(['uc32-session-a', 'uc32-session-b']);
    });

    it('rejects missing or invalid bearer tokens', function (): void {
        $this->getJson('/api/profile/sessions')
            ->assertStatus(401)
            ->assertJsonPath('error', 'invalid_token');
    });
});

describe('DELETE /api/profile/sessions/{sessionId} — UC-27', function (): void {
    it('revokes a single session and keeps other sessions intact', function (): void {
        $user = uc32User();
        $sessionA = uc32Tokens($user, 'app-a', 'uc32-session-a');
        $sessionB = uc32Tokens($user, 'app-b', 'uc32-session-b');

        $response = $this
            ->withHeader('X-Request-Id', 'req-uc32-revoke-one')
            ->deleteJson(
                '/api/profile/sessions/uc32-session-a',
                [],
                uc32AuthHeaders($user, 'app-a', 'uc32-session-a'),
            );

        $response->assertOk()
            ->assertJsonPath('session_id', 'uc32-session-a')
            ->assertJsonPath('revoked', true);

        expect(app(RefreshTokenStore::class)->findActive($sessionA['refresh_token'], 'app-a'))->toBeNull()
            ->and(app(RefreshTokenStore::class)->findActive($sessionB['refresh_token'], 'app-b'))->not->toBeNull();

        expect(fn () => app(AccessTokenGuard::class)->claimsFrom($sessionA['access_token']))
            ->toThrow(RuntimeException::class);
    });

    it('rejects revocation of a session owned by another user', function (): void {
        $alice = uc32User();
        $bob = User::factory()->create([
            'subject_id' => 'uc32-other-subject',
            'email' => 'other@example.test',
            'email_verified_at' => now(),
            'display_name' => 'Other User',
            'status' => 'active',
        ]);

        uc32Tokens($alice, 'app-a', 'uc32-session-alice');
        uc32Tokens($bob, 'app-b', 'uc32-session-bob');

        $this
            ->deleteJson(
                '/api/profile/sessions/uc32-session-bob',
                [],
                uc32AuthHeaders($alice, 'app-a', 'uc32-session-alice'),
            )
            ->assertStatus(404);
    });
});

describe('DELETE /api/profile/sessions — UC-32 Logout Semua Perangkat', function (): void {
    it('revokes every active session and refresh token for the authenticated user', function (): void {
        $user = uc32User();
        $sessionA = uc32Tokens($user, 'app-a', 'uc32-session-a');
        $sessionB = uc32Tokens($user, 'app-b', 'uc32-session-b');
        $sessionC = uc32Tokens($user, 'app-a', 'uc32-session-c');

        $response = $this
            ->withHeader('X-Request-Id', 'req-uc32-revoke-all')
            ->deleteJson('/api/profile/sessions', [], uc32AuthHeaders($user, 'app-a', 'uc32-session-a'));

        $response->assertOk()
            ->assertJsonPath('revoked', true)
            ->assertJsonPath('revoked_sessions', 3)
            ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private')
            ->assertHeader('Pragma', 'no-cache');

        expect($response->json('revoked_refresh_tokens'))->toBeGreaterThanOrEqual(3);

        foreach ([$sessionA, $sessionB, $sessionC] as $tokens) {
            expect(app(RefreshTokenStore::class)->findActive($tokens['refresh_token'], $tokens['client_id'] ?? 'app-a'))
                ->toBeNull();
        }

        expect(fn () => app(AccessTokenGuard::class)->claimsFrom($sessionA['access_token']))
            ->toThrow(RuntimeException::class);
    });

    it('does not touch sessions belonging to other users', function (): void {
        $alice = uc32User();
        $bob = User::factory()->create([
            'subject_id' => 'uc32-bob-subject',
            'email' => 'bob@example.test',
            'email_verified_at' => now(),
            'display_name' => 'Bob',
            'status' => 'active',
        ]);

        uc32Tokens($alice, 'app-a', 'uc32-session-alice');
        $bobTokens = uc32Tokens($bob, 'app-b', 'uc32-session-bob');

        $this
            ->deleteJson('/api/profile/sessions', [], uc32AuthHeaders($alice, 'app-a', 'uc32-session-alice'))
            ->assertOk();

        expect(app(RefreshTokenStore::class)->findActive($bobTokens['refresh_token'], 'app-b'))
            ->not->toBeNull();
    });

    it('records a self-service audit event without leaking sensitive tokens', function (): void {
        $user = uc32User();
        uc32Tokens($user, 'app-a', 'uc32-session-a');
        uc32Tokens($user, 'app-b', 'uc32-session-b');

        $this
            ->withHeader('X-Request-Id', 'req-uc32-audit')
            ->deleteJson('/api/profile/sessions', [], uc32AuthHeaders($user, 'app-a', 'uc32-session-a'))
            ->assertOk();

        $event = AdminAuditEvent::query()
            ->where('taxonomy', 'profile.sessions_revoked_all')
            ->latest('id')
            ->firstOrFail();

        expect($event->action)->toBe('profile.sessions.revoke_all')
            ->and($event->outcome)->toBe('success')
            ->and($event->admin_subject_id)->toBe('uc32-subject')
            ->and($event->admin_role)->toBe('self-service-user')
            ->and($event->context['request_id'])->toBe('req-uc32-audit')
            ->and($event->context['revoked_sessions'])->toBeGreaterThanOrEqual(2);

        $contextJson = json_encode($event->context, JSON_THROW_ON_ERROR);
        expect($contextJson)->not->toContain('rt_')
            ->and($contextJson)->not->toContain('Bearer');
    });

    it('rejects missing or invalid bearer tokens', function (): void {
        $this->deleteJson('/api/profile/sessions')
            ->assertStatus(401)
            ->assertJsonPath('error', 'invalid_token');
    });
});

function uc32User(): User
{
    return User::factory()->create([
        'subject_id' => 'uc32-subject',
        'email' => 'uc32@example.test',
        'email_verified_at' => now(),
        'display_name' => 'UC-32 User',
        'status' => 'active',
    ]);
}

/**
 * @return array<string, mixed>
 */
function uc32Tokens(User $user, string $clientId, string $sessionId): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => $clientId,
        'scope' => 'openid profile email offline_access',
        'session_id' => $sessionId,
        'auth_time' => time(),
        'amr' => ['pwd'],
        'upstream_refresh_token' => 'upstream-'.$clientId.'-'.$sessionId,
    ]);

    $tokens['client_id'] = $clientId;

    return $tokens;
}

/**
 * @return array<string, string>
 */
function uc32AuthHeaders(User $user, string $clientId, string $sessionId): array
{
    $tokens = uc32Tokens($user, $clientId, $sessionId);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
