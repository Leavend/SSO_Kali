<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Regression guard for the 2026-05-13 portal incident where
 * DELETE /api/profile/sessions/{sessionId} returned 404 when
 * the target session was a portal-type session stored in
 * `sso_sessions` table.
 *
 * Root cause: UserSessionsService::belongsToSubject only checked
 * `refresh_token_rotations`, missing portal sessions entirely.
 *
 * Contract: a user authenticated via session cookie must be able
 * to revoke any of their own sessions, regardless of whether the
 * session originated from an OAuth flow or the portal itself.
 */
beforeEach(function (): void {
    test()->seed(RbacSeeder::class);
});

describe('DELETE /api/profile/sessions/{sessionId} — portal session revocation', function (): void {
    it('revokes a portal session that exists only in sso_sessions table', function (): void {
        [, $authCookie, $targetSessionId] = revokePortalSetup();

        $response = test()
            ->withHeader('Cookie', config('sso.session.cookie').'='.$authCookie)
            ->withHeader('X-Request-Id', 'req-portal-revoke-single')
            ->deleteJson("/api/profile/sessions/{$targetSessionId}");

        $response->assertOk()
            ->assertJsonPath('session_id', $targetSessionId)
            ->assertJsonPath('revoked', true);

        $session = SsoSession::query()->where('session_id', $targetSessionId)->first();
        expect($session)->not->toBeNull()
            ->and($session->revoked_at)->not->toBeNull();
    });

    it('returns 404 when portal session does not belong to the authenticated user', function (): void {
        [, $aliceCookie] = revokePortalUserWithSession('alice');
        [, , $bobTargetSession] = revokePortalSetup('bob');

        test()
            ->withHeader('Cookie', config('sso.session.cookie').'='.$aliceCookie)
            ->deleteJson("/api/profile/sessions/{$bobTargetSession}")
            ->assertStatus(404)
            ->assertJsonPath('error', 'session_not_found');
    });

    it('returns 404 when session id does not exist anywhere', function (): void {
        [, $authCookie] = revokePortalUserWithSession('ghost');
        $fakeSessionId = (string) Str::uuid();

        test()
            ->withHeader('Cookie', config('sso.session.cookie').'='.$authCookie)
            ->deleteJson("/api/profile/sessions/{$fakeSessionId}")
            ->assertStatus(404)
            ->assertJsonPath('error', 'session_not_found');
    });

    it('revokes all portal sessions owned by the authenticated user', function (): void {
        [$user, $authCookie, $targetSessionId] = revokePortalSetup('all');
        $extraSessionId = revokePortalCreateSession($user);
        [, , $otherUserSessionId] = revokePortalSetup('other-user');

        test()
            ->withHeader('Cookie', config('sso.session.cookie').'='.$authCookie)
            ->withHeader('X-Request-Id', 'req-portal-revoke-all')
            ->deleteJson('/api/profile/sessions')
            ->assertOk()
            ->assertJsonPath('revoked', true)
            ->assertJsonPath('revoked_sessions', 3);

        foreach ([$authCookie, $targetSessionId, $extraSessionId] as $sessionId) {
            $session = SsoSession::query()->where('session_id', $sessionId)->first();
            expect($session)->not->toBeNull()
                ->and($session->revoked_at)->not->toBeNull();
        }

        $otherUserSession = SsoSession::query()->where('session_id', $otherUserSessionId)->first();
        expect($otherUserSession)->not->toBeNull()
            ->and($otherUserSession->revoked_at)->toBeNull();
    });

    it('returns 401 when no authentication is provided', function (): void {
        $fakeSessionId = (string) Str::uuid();

        test()->deleteJson("/api/profile/sessions/{$fakeSessionId}")
            ->assertUnauthorized();
    });
});

/**
 * Creates a user with TWO portal sessions:
 *   - One used for authentication (the cookie)
 *   - One as the target to be revoked
 *
 * @return array{0: User, 1: string, 2: string} [user, authSessionId, targetSessionId]
 */
function revokePortalSetup(string $prefix = 'revoke'): array
{
    $user = revokePortalCreateUser($prefix);
    $authSessionId = revokePortalCreateSession($user);
    $targetSessionId = revokePortalCreateSession($user);

    return [$user, $authSessionId, $targetSessionId];
}

/**
 * Creates a user with a single portal session for authentication.
 *
 * @return array{0: User, 1: string} [user, authSessionId]
 */
function revokePortalUserWithSession(string $prefix): array
{
    $user = revokePortalCreateUser($prefix);
    $authSessionId = revokePortalCreateSession($user);

    return [$user, $authSessionId];
}

function revokePortalCreateUser(string $prefix): User
{
    return User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $prefix.'-'.Str::random(8).'@portal-revoke.example.test',
        'password' => Hash::make('irrelevant'),
        'display_name' => ucfirst($prefix).' User',
        'given_name' => ucfirst($prefix),
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);
}

function revokePortalCreateSession(User $user): string
{
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'RevokePortalSessionContractTest/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return $sessionId;
}
