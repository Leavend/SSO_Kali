<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;
use App\Models\User;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
});

it('returns 401 for destructive session management requests without a bearer token', function (): void {
    /** @var TestCase $this */
    $this->deleteJson('/admin/api/sessions/session-1')
        ->assertStatus(401)
        ->assertJsonPath('error', 'unauthorized');

    assertAuditEvent('denied', 'admin_api', 'missing_or_invalid_bearer', null, null);
});

it('returns 403 for non-admin users attempting destructive session management', function (): void {
    /** @var TestCase $this */
    $user = User::factory()->create([
        'subject_id' => '1001',
        'subject_uuid' => '1001',
        'role' => 'user',
    ]);

    $token = adminAccessToken($user);

    $this->withToken($token)
        ->deleteJson('/admin/api/sessions/session-1')
        ->assertStatus(403)
        ->assertJsonPath('error', 'forbidden');

    assertAuditEvent('denied', 'admin_api', 'admin_role_required', $user->subject_id, 'forbidden');
});

it('returns 403 when an admin lacks an explicit session management role', function (): void {
    /** @var TestCase $this */
    config()->set('sso.admin.session_management_roles', ['super-admin']);

    $admin = User::factory()->create([
        'subject_id' => '2001',
        'subject_uuid' => '2001',
        'role' => 'admin',
    ]);

    $token = adminAccessToken($admin);

    $this->withToken($token)
        ->deleteJson('/admin/api/sessions/session-1')
        ->assertStatus(403)
        ->assertJsonPath('error_description', 'Explicit session management role is required.');

    assertAuditEvent('denied', 'session_management', 'explicit_role_required', $admin->subject_id, 'forbidden');
});

it('records audit events when an authorized admin revokes a session', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'https://app-a.example/api/backchannel/logout' => Http::response([], 200),
    ]);

    $admin = User::factory()->create([
        'subject_id' => '3001',
        'subject_uuid' => '3001',
        'role' => 'admin',
        'email' => 'admin@example.com',
    ]);

    User::factory()->create([
        'subject_id' => '4001',
        'subject_uuid' => '4001',
        'role' => 'user',
    ]);

    seedAdminSession('session-1', '4001');
    app(BackChannelSessionRegistry::class)->register('session-1', 'prototype-app-a', 'https://app-a.example/api/backchannel/logout');

    $response = $this->withToken(adminAccessToken($admin))
        ->deleteJson('/admin/api/sessions/session-1');

    $response
        ->assertOk()
        ->assertJsonPath('revoked', true)
        ->assertJsonPath('session_id', 'session-1');

    expect(DB::table('refresh_token_rotations')->where('session_id', 'session-1')->whereNull('revoked_at')->count())
        ->toBe(0);

    $event = latestAuditEvent();

    expect($event['outcome'])->toBe('succeeded')
        ->and($event['action'])->toBe('revoke_session')
        ->and($event['taxonomy'])->toBe('destructive_action_with_step_up')
        ->and($event['admin_email'])->toBe('admin@example.com')
        ->and($event['context']['session_id'] ?? null)->toBe('session-1')
        ->and($event['event_hash'])->toBeString()
        ->and($event['event_hash'] === '')->toBeFalse();
});

it('keeps destructive actions successful when back-channel delivery is deferred to the queue', function (): void {
    /** @var TestCase $this */
    Queue::fake();

    $admin = User::factory()->create([
        'subject_id' => '5001',
        'subject_uuid' => '5001',
        'role' => 'admin',
        'email' => 'admin@example.com',
    ]);

    User::factory()->create([
        'subject_id' => '6001',
        'subject_uuid' => '6001',
        'role' => 'user',
    ]);

    seedAdminSession('session-1', '6001');
    app(BackChannelSessionRegistry::class)->register('session-1', 'prototype-app-a', 'https://app-a.example/api/backchannel/logout');

    $this->withToken(adminAccessToken($admin))
        ->deleteJson('/admin/api/sessions/session-1')
        ->assertOk()
        ->assertJsonPath('revoked', true)
        ->assertJsonPath('session_id', 'session-1');

    Queue::assertPushed(
        DispatchBackChannelLogoutJob::class,
        fn (DispatchBackChannelLogoutJob $job): bool => $job->logoutUri === 'https://app-a.example/api/backchannel/logout',
    );

    $event = latestAuditEvent();

    expect($event['outcome'])->toBe('succeeded')
        ->and($event['action'])->toBe('revoke_session')
        ->and($event['taxonomy'])->toBe('destructive_action_with_step_up')
        ->and($event['admin_subject_id'])->toBe('5001');
});

function adminAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
    ]);

    return (string) $tokens['access_token'];
}

function seedAdminSession(string $sessionId, string $subjectId): void
{
    DB::table('refresh_token_rotations')->insert([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => 'refresh-'.$sessionId,
        'token_family_id' => 'family-'.$sessionId,
        'secret_hash' => 'hash',
        'scope' => 'openid profile email',
        'session_id' => $sessionId,
        'upstream_refresh_token' => null,
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function assertAuditEvent(
    string $outcome,
    string $action,
    string $reason,
    ?string $subjectId = null,
    ?string $taxonomy = null,
): void {
    $event = latestAuditEvent();

    expect($event['outcome'])->toBe($outcome)
        ->and($event['action'])->toBe($action)
        ->and($event['reason'])->toBe($reason)
        ->and($event['admin_subject_id'])->toBe($subjectId)
        ->and($event['taxonomy'])->toBe($taxonomy);
}

/**
 * @return array<string, mixed>
 */
function latestAuditEvent(): array
{
    /** @var object $event */
    $event = DB::table('admin_audit_events')->orderByDesc('id')->first();

    return [
        'outcome' => $event->outcome,
        'action' => $event->action,
        'reason' => $event->reason,
        'taxonomy' => $event->taxonomy,
        'admin_subject_id' => $event->admin_subject_id,
        'admin_email' => $event->admin_email,
        'event_hash' => $event->event_hash,
        'context' => json_decode((string) $event->context, true, 512, JSON_THROW_ON_ERROR),
    ];
}
