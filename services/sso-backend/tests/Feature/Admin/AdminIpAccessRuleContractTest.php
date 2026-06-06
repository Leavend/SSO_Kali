<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\IpAccessRule;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.mfa.enforced', false);

    $this->seed(RbacSeeder::class);
});

it('lists ip access rules', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_list', 'role' => 'admin']);

    IpAccessRule::create(['cidr' => '10.0.0.0/8', 'mode' => 'allow', 'reason' => 'Internal range', 'actor_subject_id' => $admin->subject_id]);

    $response = $this->withToken(ipAccessAdminTokenFor($admin))
        ->getJson('/admin/api/ip-access-rules');

    $response->assertOk()
        ->assertJsonCount(1, 'rules')
        ->assertJsonPath('rules.0.cidr', '10.0.0.0/8')
        ->assertJsonPath('rules.0.mode', 'allow');
});

it('creates an allow rule', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_create', 'role' => 'admin']);

    $response = $this->withToken(ipAccessAdminTokenFor($admin))
        ->postJson('/admin/api/ip-access-rules', [
            'cidr' => '203.0.113.0/24',
            'mode' => 'block',
            'reason' => 'Block known attack range',
        ]);

    $response->assertCreated()
        ->assertJsonPath('rule.cidr', '203.0.113.0/24')
        ->assertJsonPath('rule.mode', 'block')
        ->assertJsonPath('rule.reason', 'Block known attack range');

    expect(IpAccessRule::query()->where('cidr', '203.0.113.0/24')->exists())->toBeTrue();
    expect(AdminAuditEvent::query()->where('action', 'create_ip_access_rule')->exists())->toBeTrue();
});

it('deletes an ip access rule', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_delete', 'role' => 'admin']);

    $rule = IpAccessRule::create(['cidr' => '10.0.0.0/8', 'mode' => 'allow', 'reason' => 'Internal', 'actor_subject_id' => $admin->subject_id]);

    $this->withToken(ipAccessAdminTokenFor($admin))
        ->deleteJson('/admin/api/ip-access-rules/'.$rule->id)
        ->assertNoContent();

    expect(IpAccessRule::query()->where('id', $rule->id)->exists())->toBeFalse();
    expect(AdminAuditEvent::query()->where('action', 'delete_ip_access_rule')->exists())->toBeTrue();
});

it('requires ip access read permission to list rules', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_no_read', 'role' => 'admin']);
    $admin->roles()->sync([Role::query()->where('slug', 'support')->value('id')]);

    $this->withToken(ipAccessAdminTokenFor($admin))
        ->getJson('/admin/api/ip-access-rules')
        ->assertStatus(403);
});

it('requires ip access write permission to create rules', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_no_write', 'role' => 'admin']);
    $admin->roles()->sync([Role::query()->where('slug', 'auditor')->value('id')]);

    $this->withToken(ipAccessAdminTokenFor($admin))
        ->postJson('/admin/api/ip-access-rules', [
            'cidr' => '10.0.0.0/8',
            'mode' => 'allow',
            'reason' => 'Internal',
        ])
        ->assertStatus(403);
});

it('requires step up for write endpoints and returns 428 without fresh auth', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_ip_stale', 'role' => 'admin']);

    $staleToken = adminTokenWithAuthTime($admin, now()->subMinutes(20)->timestamp);

    $this->withToken($staleToken)
        ->postJson('/admin/api/ip-access-rules', [
            'cidr' => '10.0.0.0/8',
            'mode' => 'allow',
            'reason' => 'Internal',
        ])
        ->assertStatus(428);
});

function ipAccessAdminTokenFor(User $user): string
{
    return adminTokenWithAuthTime($user, now()->subMinute()->timestamp);
}

function adminTokenWithAuthTime(User $user, int $authTime): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => $authTime,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
