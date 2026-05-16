<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\BackChannelSessionRegistry;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');
    config()->set('sso.session.cookie', '__Host-sso_session');
});

it('fans out portal /api/auth/logout to every registered RP back-channel session and revokes refresh tokens for that subject', function (): void {
    Bus::fake();

    [$user, $sessionId] = portalLogoutSubjectAndSession();

    app(BackChannelSessionRegistry::class)->register(
        $sessionId,
        'rp-a',
        'https://rp-a.test/backchannel/logout',
        ['subject_id' => $user->subject_id],
    );
    app(BackChannelSessionRegistry::class)->register(
        $sessionId,
        'rp-b',
        'https://rp-b.test/backchannel/logout',
        ['subject_id' => $user->subject_id],
    );

    $existingTokenId = (string) Str::uuid();
    DB::table('refresh_token_rotations')->insert([
        'subject_id' => $user->subject_id,
        'subject_uuid' => $user->subject_id,
        'client_id' => 'rp-a',
        'refresh_token_id' => $existingTokenId,
        'token_family_id' => (string) Str::uuid(),
        'family_created_at' => now(),
        'secret_hash' => hash('sha256', 'plain-secret'),
        'scope' => 'openid offline_access',
        'session_id' => $sessionId,
        'auth_time' => now(),
        'amr' => null,
        'acr' => null,
        'upstream_refresh_token' => null,
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $this->withHeader('Cookie', '__Host-sso_session='.$sessionId)
        ->withHeader('X-Request-Id', 'req-portal-logout-fanout')
        ->postJson('/api/auth/logout')
        ->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('revoked', true);

    Bus::assertDispatched(DispatchBackChannelLogoutJob::class, 2);

    $row = DB::table('refresh_token_rotations')->where('refresh_token_id', $existingTokenId)->firstOrFail();
    expect($row->revoked_at)->not->toBeNull();

    expect(app(BackChannelSessionRegistry::class)->forSession($sessionId))->toBe([]);
});

it('does not dispatch any RP fan-out when the portal logout has no active session', function (): void {
    Bus::fake();

    $this->withHeader('X-Request-Id', 'req-portal-logout-noop')
        ->postJson('/api/auth/logout')
        ->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('revoked', false);

    Bus::assertNothingDispatched();
});

/**
 * @return array{0: User, 1: string}
 */
function portalLogoutSubjectAndSession(): array
{
    $user = User::factory()->create([
        'email' => 'portal-logout-'.Str::random(8).'@example.test',
    ]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PortalLogoutFanoutContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}
