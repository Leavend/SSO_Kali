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
    auditTrailStore()->append(auditTrailPayload('denied', 'admin_api', ['access_token' => 'secret-token']));
    auditTrailStore()->append(auditTrailPayload('succeeded', 'sync_user_roles', ['role' => 'auditor']));

    $response = $this->getJson('/admin/api/audit/events?'.http_build_query([
        'outcome' => 'denied',
        'limit' => 1,
    ]), auditTrailHeaders($admin));

    $response->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.action', 'admin_api')
        ->assertJsonPath('events.0.context.access_token', '[redacted]')
        ->assertJsonStructure(['events' => [['event_id', 'hash_chain', 'occurred_at']], 'pagination']);

    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))->not->toContain('secret-token');
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
function auditTrailPayload(string $outcome, string $action, array $context = []): array
{
    return [
        'action' => $action,
        'outcome' => $outcome,
        'taxonomy' => 'forbidden',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => 'admin/api/audit/events',
        'ip_address' => '127.0.0.1',
        'reason' => 'policy',
        'context' => $context,
        'occurred_at' => now(),
    ];
}
