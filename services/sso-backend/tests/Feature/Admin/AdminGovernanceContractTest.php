<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\DataSubjectRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);

    $this->seed(RbacSeeder::class);
});

it('lets a subject submit, list, and exposes admin review for a data subject request', function (): void {
    $subject = User::factory()->create(['subject_id' => 'usr_dsr_demo', 'role' => 'user']);
    $admin = User::factory()->create(['subject_id' => 'admin_dsr_review', 'role' => 'admin']);
    $admin->roles()->sync([Role::query()->where('slug', 'security-officer')->value('id')]);

    $accessToken = (string) app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'session-dsr-'.$subject->subject_id,
        'subject_id' => $subject->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
        'acr' => 'urn:example:loa:1',
    ])['access_token'];

    $store = $this->withToken($accessToken)->postJson('/api/profile/data-subject-requests', [
        'type' => 'export',
        'reason' => 'GDPR Article 15 portability request.',
    ]);

    $store->assertStatus(201)
        ->assertJsonPath('request.type', 'export')
        ->assertJsonPath('request.status', 'submitted');
    expect($store->headers->get('Cache-Control'))->toContain('no-store');

    $requestId = $store->json('request.request_id');
    expect($requestId)->toBeString();

    expect(DataSubjectRequest::query()->where('request_id', $requestId)->value('subject_id'))
        ->toBe($subject->subject_id);

    $list = $this->withToken($accessToken)->getJson('/api/profile/data-subject-requests');
    $list->assertOk()
        ->assertJsonCount(1, 'requests')
        ->assertJsonPath('requests.0.request_id', $requestId);

    $adminList = $this->withToken(adminAccessTokenFor($admin))
        ->getJson('/admin/api/data-subject-requests');
    $adminList->assertOk()->assertJsonPath('requests.0.request_id', $requestId);

    $review = $this->withToken(adminAccessTokenFor($admin))
        ->postJson('/admin/api/data-subject-requests/'.$requestId.'/review', [
            'decision' => 'approved',
            'notes' => 'Verified subject identity via portal session.',
        ]);
    $review->assertOk()->assertJsonPath('request.status', 'approved');

    $fulfill = $this->withToken(adminAccessTokenFor($admin))
        ->postJson('/admin/api/data-subject-requests/'.$requestId.'/fulfill', [
            'dry_run' => true,
        ]);
    $fulfill->assertOk()
        ->assertJsonPath('dry_run', true)
        ->assertJsonPath('artifact.subject_id', $subject->subject_id);

    expect($fulfill->json('artifact.profile.email'))->toBe($subject->email);
    expect($fulfill->json('artifact.redaction_notes.excluded_fields'))->toContain('users.password');

    expect(AdminAuditEvent::query()->where('action', 'submit_data_subject_request')->exists())->toBeTrue();
    expect(AdminAuditEvent::query()->where('action', 'review_data_subject_request')->exists())->toBeTrue();
    expect(AdminAuditEvent::query()->where('action', 'fulfill_data_subject_request')->exists())->toBeTrue();
});

it('exposes a permission-gated dashboard summary with bounded counters', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_dashboard', 'role' => 'admin']);

    $response = $this->withToken(adminAccessTokenFor($admin))
        ->getJson('/admin/api/dashboard/summary');

    $response->assertOk()
        ->assertJsonStructure([
            'generated_at',
            'counters' => [
                'users' => ['total', 'active', 'disabled', 'locked'],
                'sessions' => ['portal_active', 'rp_active'],
                'clients' => ['total', 'active', 'staged', 'decommissioned'],
                'audit' => ['admin_last_24h', 'auth_last_24h'],
                'incidents' => ['admin_denied_last_24h'],
                'data_subject_requests' => ['submitted', 'approved', 'rejected', 'fulfilled'],
            ],
        ]);
    expect($response->headers->get('Cache-Control'))->toContain('no-store');

    foreach ($response->json('counters.users') as $value) {
        expect($value)->toBeInt();
    }
});

it('locks and unlocks a managed user with audit and reason tracking', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_lock', 'role' => 'admin']);
    $target = User::factory()->create(['subject_id' => 'usr_lock_target', 'role' => 'user', 'status' => 'active']);

    $until = now()->addHours(6);

    $lock = $this->withToken(adminAccessTokenFor($admin))
        ->postJson('/admin/api/users/'.$target->subject_id.'/lock', [
            'reason' => 'Suspected account compromise; investigating.',
            'locked_until' => $until->toIso8601String(),
        ]);

    $lock->assertOk();
    expect($lock->json('user.locked_at'))->not->toBeNull();

    $target->refresh();
    expect($target->locked_at)->not->toBeNull()
        ->and($target->locked_until)->not->toBeNull()
        ->and($target->locked_reason)->toContain('compromise')
        ->and($target->locked_by_subject_id)->toBe($admin->subject_id)
        ->and($target->lock_count)->toBe(1);

    $unlock = $this->withToken(adminAccessTokenFor($admin))
        ->postJson('/admin/api/users/'.$target->subject_id.'/unlock', [
            'reason' => 'Investigation complete; risk cleared.',
        ]);

    $unlock->assertOk();
    $target->refresh();
    expect($target->locked_at)->toBeNull()
        ->and($target->locked_until)->toBeNull()
        ->and($target->locked_reason)->toBeNull();

    expect(AdminAuditEvent::query()->where('action', 'lock_managed_user')->exists())->toBeTrue();
    expect(AdminAuditEvent::query()->where('action', 'unlock_managed_user')->exists())->toBeTrue();
});

it('exports admin audit events as csv with a field whitelist and audit row', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_export', 'role' => 'admin']);

    AdminAuditEvent::query()->getConnection()->table('admin_audit_events')->insert([
        'event_id' => '01J0EXPORTROW0000000000001',
        'action' => 'create_managed_user',
        'outcome' => 'succeeded',
        'taxonomy' => 'destructive_action_with_step_up',
        'admin_subject_id' => $admin->subject_id,
        'admin_email' => $admin->email,
        'admin_role' => 'admin',
        'method' => 'POST',
        'path' => 'admin/api/users',
        'ip_address' => '127.0.0.1',
        'reason' => null,
        'context' => json_encode(['email' => 'demo@example.test']),
        'occurred_at' => now()->subMinute(),
        'previous_hash' => null,
        'event_hash' => str_repeat('a', 64),
        'signing_key_id' => 'legacy',
        'created_at' => now(),
    ]);

    $response = $this->withToken(adminAccessTokenFor($admin))
        ->get('/admin/api/audit/export?format=csv&from='.urlencode(now()->subDay()->toIso8601String()));

    $response->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

    $csv = $response->streamedContent();
    expect($csv)->toContain('event_id')
        ->and($csv)->toContain('signing_key_id')
        ->and($csv)->not->toContain('event_hash,event_hash')
        ->and($csv)->not->toContain('demo@example.test'); // context column intentionally excluded

    expect(AdminAuditEvent::query()->where('action', 'export_admin_audit_events')->exists())->toBeTrue();
});

it('seeds least-privilege admin roles with documented permission catalogs', function (): void {
    foreach (['auditor', 'support', 'client-manager', 'security-officer'] as $slug) {
        expect(Role::query()->where('slug', $slug)->exists())->toBeTrue();
    }

    $auditorPermissions = Role::query()
        ->where('slug', 'auditor')
        ->firstOrFail()
        ->permissions
        ->pluck('slug')
        ->all();

    expect($auditorPermissions)->toContain(AdminPermission::AUDIT_READ)
        ->and($auditorPermissions)->toContain(AdminPermission::AUDIT_EXPORT)
        ->and($auditorPermissions)->not->toContain(AdminPermission::USERS_WRITE)
        ->and($auditorPermissions)->not->toContain(AdminPermission::CLIENTS_WRITE);

    $support = Role::query()->where('slug', 'support')->firstOrFail()->permissions->pluck('slug')->all();
    expect($support)->toContain(AdminPermission::USERS_READ)->and($support)->not->toContain(AdminPermission::USERS_WRITE);

    $clientManager = Role::query()->where('slug', 'client-manager')->firstOrFail()->permissions->pluck('slug')->all();
    expect($clientManager)->toContain(AdminPermission::CLIENTS_WRITE)->and($clientManager)->not->toContain(AdminPermission::USERS_WRITE);

    $securityOfficer = Role::query()->where('slug', 'security-officer')->firstOrFail()->permissions->pluck('slug')->all();
    expect($securityOfficer)->toContain(AdminPermission::USER_LIFECYCLE_LOCK)
        ->and($securityOfficer)->toContain(AdminPermission::DATA_SUBJECT_REQUESTS_REVIEW);
});

function adminAccessTokenFor(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
