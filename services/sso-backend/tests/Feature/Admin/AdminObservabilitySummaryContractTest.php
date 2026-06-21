<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\AuthenticationAuditEvent;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);

    $this->seed(RbacSeeder::class);
});

it('requires explicit observability permission', function (): void {
    $admin = observabilityAdmin([AdminPermission::AUDIT_READ]);

    $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin))
        ->assertStatus(403);
});

it('returns a safe no-store observability summary for the three SSO services', function (): void {
    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    AdminAuditEvent::query()->create([
        'event_id' => '01JOBSADMIN000000000000001',
        'action' => 'admin_api',
        'outcome' => 'denied',
        'taxonomy' => 'forbidden',
        'admin_subject_id' => $admin->subject_id,
        'admin_email' => $admin->email,
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => '/admin/api/users',
        'ip_address' => '127.0.0.1',
        'reason' => 'policy',
        'context' => ['access_token' => 'secret-token-value'],
        'request_id' => 'req-observability-admin-123456',
        'support_reference' => 'REF-IN123456',
        'occurred_at' => now(),
        'previous_hash' => null,
        'event_hash' => str_repeat('a', 64),
        'signing_key_id' => 'testing',
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => '01JOBSAUTH0000000000000001',
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'subject_id' => 'usr-observability',
        'email' => 'user@example.test',
        'client_id' => 'sso-portal',
        'session_id' => 'sid-observability',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'error_code' => 'invalid_credentials',
        'request_id' => 'req-observability-auth-654321',
        'context' => ['password' => 'secret-password-value'],
        'occurred_at' => now(),
        'created_at' => now(),
    ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin));

    $response->assertOk()
        ->assertJsonStructure([
            'generated_at',
            'partial',
            'degraded',
            'services' => [['key', 'name', 'status', 'summary', 'request_rate_per_min', 'error_rate_percent']],
            'metrics' => ['window_seconds', 'queue', 'performance', 'auth_funnel', 'admin_activity'],
            'logs' => [['service', 'severity', 'message', 'reference', 'occurred_at']],
            'traces' => ['status', 'reason', 'next_step', 'last_seen_trace_id'],
        ])
        ->assertJsonPath('traces.status', 'unavailable');

    expect($response->headers->get('Cache-Control'))->toContain('no-store');
    expect(collect($response->json('services'))->pluck('key')->all())
        ->toBe(['sso-backend', 'sso-portal', 'admin-sso']);

    $payload = json_encode($response->json(), JSON_THROW_ON_ERROR);
    expect($payload)->not->toContain('secret-token-value')
        ->and($payload)->not->toContain('secret-password-value')
        ->and($payload)->not->toContain('sid-observability');
});

function observabilityAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'observability-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'observability-role-'.uniqid(), 'name' => 'Observability Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/**
 * @return array<string, string>
 */
function observabilityHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'observability-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
