<?php

declare(strict_types=1);

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('sso.audit.authentication_retention_days', 90);
    config()->set('sso.audit.admin_retention_days', 730);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    Cache::flush();
    $this->seed(RbacSeeder::class);
});

it('requires audit read permission for retention status evidence', function (): void {
    $admin = retentionStatusAdmin([AdminPermission::USERS_READ]);

    $this->getJson('/admin/api/audit/retention', retentionStatusHeaders($admin))
        ->assertStatus(403);
});

it('exposes retention windows candidates and last prune metadata for admin audit compliance', function (): void {
    $admin = retentionStatusAdmin([AdminPermission::AUDIT_READ]);
    retentionStatusAuthenticationEvent('old-login', now()->subDays(120));
    retentionStatusAuthenticationEvent('fresh-login', now()->subDays(2));

    $this->artisan('sso:prune-authentication-audit-events --limit=1')
        ->assertSuccessful();

    $response = $this->getJson('/admin/api/audit/retention', retentionStatusHeaders($admin));

    $response->assertOk()
        ->assertHeader('Cache-Control')
        ->assertJsonPath('retention.items.1.category', 'authentication_audit_events')
        ->assertJsonPath('retention.items.1.window.days', 90)
        ->assertJsonPath('retention.items.1.schedule', 'daily')
        ->assertJsonPath('retention.items.1.last_pruned_count', 1)
        ->assertJsonPath('retention.items.2.category', 'refresh_tokens')
        ->assertJsonPath('retention.items.3.category', 'authorization_codes')
        ->assertJsonPath('retention.items.4.category', 'telescope_entries');

    expect($response->json('retention.generated_at'))->toBeString()
        ->and($response->json('retention.items.1.last_pruned_at'))->toBeString()
        ->and($response->json('retention.items.1.cutoff'))->toBeString();
});

it('includes retention status in the compliance evidence pack', function (): void {
    $admin = retentionStatusAdmin([AdminPermission::AUDIT_EXPORT]);

    $response = $this->get('/admin/api/compliance/evidence-pack?format=json&correlation_id=INC-42', retentionStatusHeaders($admin));

    $response->assertOk()
        ->assertHeader('Content-Disposition', 'attachment; filename="compliance-evidence-pack.json"')
        ->assertHeader('Cache-Control');

    $payload = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store')
        ->and($payload['filters']['correlation_id'])->toBe('INC-42')
        ->and($payload['integrity'])->toBeArray()
        ->and($payload['retention']['items'])->toBeArray()
        ->and($payload['retention']['items'][0]['category'])->toBe('admin_audit_events');
});

function retentionStatusAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'retention-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'retention-role-'.uniqid(), 'name' => 'Retention Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/** @return array<string, string> */
function retentionStatusHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'retention-status-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}

function retentionStatusAuthenticationEvent(string $eventType, DateTimeInterface $occurredAt): void
{
    app(RecordAuthenticationAuditEventAction::class)->execute(new AuthenticationAuditRecord(
        eventType: $eventType,
        outcome: 'succeeded',
        subjectId: 'retention-subject',
        email: 'retention@example.test',
        clientId: 'app-a',
        sessionId: 'retention-session',
        ipAddress: '203.0.113.55',
        userAgent: 'RetentionStatusContract/1.0',
        errorCode: null,
        requestId: 'req-retention-'.$eventType,
        context: ['retention_status' => true],
        occurredAt: $occurredAt,
    ));
}
