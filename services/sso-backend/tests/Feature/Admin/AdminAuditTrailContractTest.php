<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    $this->seed(RbacSeeder::class);
});

it('requires admin audit read permission for audit trail access', function (): void {
    $admin = auditTrailAdmin([AdminPermission::USERS_READ]);

    $this->getJson('/admin/api/audit/events', auditTrailHeaders($admin))
        ->assertStatus(403);
});

it('lists filters and paginates safe audit trail events', function (): void {
    $admin = auditTrailAdmin([AdminPermission::AUDIT_READ]);
    auditTrailStore()->append(auditTrailPayload('denied', 'admin_api', ['access_token' => 'secret-token'], 'admin-1', now()->subHour()));
    auditTrailStore()->append(auditTrailPayload('succeeded', 'sync_user_roles', ['role' => 'auditor'], 'admin-2', now()->subDays(2)));

    $response = $this->getJson('/admin/api/audit/events?'.http_build_query([
        'action' => 'admin_api',
        'outcome' => 'denied',
        'taxonomy' => 'forbidden',
        'admin_subject_id' => 'admin-1',
        'from' => now()->subDay()->toIso8601String(),
        'to' => now()->addMinute()->toIso8601String(),
        'limit' => 1,
    ]), auditTrailHeaders($admin));

    $response->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.action', 'admin_api')
        ->assertJsonPath('events.0.actor.subject_id', 'admin-1')
        ->assertJsonPath('events.0.context.access_token', '[redacted]')
        ->assertJsonStructure(['events' => [['event_id', 'hash_chain', 'occurred_at']], 'pagination']);

    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))->not->toContain('secret-token');

    $cursorResponse = $this->getJson('/admin/api/audit/events?'.http_build_query([
        'limit' => 1,
    ]), auditTrailHeaders($admin));

    $nextCursor = $cursorResponse->json('pagination.next_cursor');
    expect($nextCursor)->toBeString();

    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'limit' => 1,
        'cursor' => $nextCursor,
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events');
});

it('filters admin audit events by target account application and session context', function (): void {
    $admin = auditTrailAdmin([AdminPermission::AUDIT_READ]);

    auditTrailStore()->append(auditTrailPayload('succeeded', 'revoke_session', [
        'target_subject_id' => 'usr-target-a',
        'client_id' => 'prototype-app-a',
        'session_id' => 'sid-target-a',
    ]));
    auditTrailStore()->append(auditTrailPayload('succeeded', 'revoke_session', [
        'subject_id' => 'usr-target-b',
        'client_id' => 'prototype-app-b',
        'session_id' => 'sid-target-b',
    ]));
    auditTrailStore()->append(auditTrailPayload('succeeded', 'revoke_session', [
        'target_subject_id' => 'usr-target-a',
        'client_id' => 'prototype-app-b',
        'session_id' => 'sid-target-c',
    ]));

    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'subject_id' => 'usr-target-a',
        'client_id' => 'prototype-app-a',
        'session_id' => 'sid-target-a',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.context.target_subject_id', 'usr-target-a')
        ->assertJsonPath('events.0.context.client_id', 'prototype-app-a')
        ->assertJsonPath('events.0.context.session_id', 'sid-target-a');

    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'subject_id' => 'usr-target-b',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.context.subject_id', 'usr-target-b');

    // Refined checks:
    // 1. Suffix matching for subject_id (target_subject_id)
    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'subject_id' => 'REF-RTARGETA',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(2, 'events');

    // 2. Suffix matching for session_id
    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'session_id' => 'REF-DTARGETA',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.context.session_id', 'sid-target-a');

    // 3. Friendly client_id slug matching
    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'client_id' => 'Prototype App A',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.context.client_id', 'prototype-app-a');
});

it('filters and exports admin audit events through indexed correlation columns', function (): void {
    $admin = auditTrailAdmin([AdminPermission::AUDIT_READ, AdminPermission::AUDIT_EXPORT]);
    auditTrailStore()->append(auditTrailPayload('succeeded', 'revoke_session', [
        'request_id' => 'req-indexed-123',
        'target_subject_id' => 'usr-indexed-target',
        'client_id' => 'client-indexed',
        'session_id' => 'sid-indexed',
    ]));

    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();

    expect($event->request_id)->toBe('req-indexed-123')
        ->and($event->support_reference)->toBe('REF-DEXED123')
        ->and($event->target_subject_id)->toBe('usr-indexed-target')
        ->and($event->client_id)->toBe('client-indexed')
        ->and($event->session_id)->toBe('sid-indexed');

    DB::table('admin_audit_events')->where('id', $event->id)->update([
        'context' => json_encode(['request_id' => 'req-context-mismatch'], JSON_THROW_ON_ERROR),
    ]);

    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'request_id' => 'req-indexed-123',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_id', $event->event_id);

    $this->getJson('/admin/api/audit/events?'.http_build_query([
        'request_id' => 'REF-DEXED123',
    ]), auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_id', $event->event_id);

    $response = $this->get('/admin/api/audit/export?'.http_build_query([
        'format' => 'csv',
        'support_reference' => 'REF-DEXED123',
    ]), auditTrailHeaders($admin));

    $response->assertOk();
    expect(array_filter(explode("\n", trim($response->streamedContent()))))->toHaveCount(2);

    $responseReqId = $this->get('/admin/api/audit/export?'.http_build_query([
        'format' => 'csv',
        'request_id' => 'REF-DEXED123',
    ]), auditTrailHeaders($admin));

    $responseReqId->assertOk();
    expect(array_filter(explode("\n", trim($responseReqId->streamedContent()))))->toHaveCount(2);
});

it('shows one safe audit event and returns not found for unknown event ids', function (): void {
    $admin = auditTrailAdmin([AdminPermission::AUDIT_READ]);
    auditTrailStore()->append(auditTrailPayload('succeeded', 'update_profile_portal', ['password' => 'secret-password']));
    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();

    $this->getJson('/admin/api/audit/events/'.$event->event_id, auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonPath('event.event_id', $event->event_id)
        ->assertJsonPath('event.context.password', '[redacted]');

    $this->getJson('/admin/api/audit/events/01UNKNOWNUNKNOWNUNKNOWNUNK', auditTrailHeaders($admin))
        ->assertStatus(404);
});

it('verifies audit hash chain integrity and detects tampering', function (): void {
    $admin = auditTrailAdmin([AdminPermission::AUDIT_READ]);
    $headers = auditTrailHeaders($admin);
    DB::table('admin_audit_events')->delete();
    auditTrailStore()->append(auditTrailPayload('denied', 'admin_api'));
    auditTrailStore()->append(auditTrailPayload('succeeded', 'revoke_session'));

    $this->getJson('/admin/api/audit/integrity', $headers)
        ->assertOk()
        ->assertJsonPath('integrity.valid', true)
        ->assertJsonPath('integrity.checked_events', 2)
        ->assertJsonPath('integrity.broken_event_id', null);

    $tampered = AdminAuditEvent::query()->latest('id')->firstOrFail();
    DB::table('admin_audit_events')->where('id', $tampered->id)->update(['reason' => 'tampered']);

    $this->getJson('/admin/api/audit/integrity', auditTrailHeaders($admin))
        ->assertOk()
        ->assertJsonPath('integrity.valid', false)
        ->assertJsonPath('integrity.broken_event_id', $tampered->event_id);
});

function auditTrailAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'audit-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'audit-role-'.uniqid(), 'name' => 'Audit Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/**
 * @return array<string, string>
 */
function auditTrailHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'audit-trail-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}

function auditTrailStore(): AdminAuditEventStore
{
    return app(AdminAuditEventStore::class);
}

/**
 * @param  array<string, mixed>  $context
 * @return array<string, mixed>
 */
function auditTrailPayload(string $outcome, string $action, array $context = [], string $adminSubjectId = 'admin-1', mixed $occurredAt = null): array
{
    return [
        'action' => $action,
        'outcome' => $outcome,
        'taxonomy' => 'forbidden',
        'admin_subject_id' => $adminSubjectId,
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => 'admin/api/audit/events',
        'ip_address' => '127.0.0.1',
        'reason' => 'policy',
        'context' => $context,
        'occurred_at' => $occurredAt ?? now(),
    ];
}
