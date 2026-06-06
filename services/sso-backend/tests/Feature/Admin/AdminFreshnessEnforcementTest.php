<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Admin\AdminFreshnessPolicy;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.freshness.read_seconds', 900);
    config()->set('sso.admin.freshness.write_seconds', 1800);
    config()->set('sso.admin.freshness.step_up_seconds', 900);
    config()->set('sso.admin.mfa.enforced', false);
});

it('allows fresh admin tokens to access the admin bootstrap endpoint', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'fresh-admin',
        'subject_uuid' => 'fresh-admin',
        'role' => 'admin',
    ]);

    $this->withToken(adminToken($admin, now()->subMinutes(2)->timestamp))
        ->getJson('/admin/api/me')
        ->assertOk();
});

it('allows stale admin bootstrap requests so principal refresh can recover sessions', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'stale-admin',
        'subject_uuid' => 'stale-admin',
        'role' => 'admin',
    ]);

    $this->withToken(adminToken($admin, now()->subMinutes(20)->timestamp))
        ->getJson('/admin/api/me')
        ->assertOk();
});

it('allows stale admin tokens to access routine read endpoints', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'stale-read-admin',
        'subject_uuid' => 'stale-read-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'read-target-user',
        'subject_uuid' => 'read-target-user',
        'role' => 'user',
    ]);

    $this->withToken(adminToken($admin, now()->subMinutes(30)->timestamp))
        ->getJson('/admin/api/users')
        ->assertOk();
});

it('returns 428 reauth_required for stale privileged write actions', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'stale-write-admin',
        'subject_uuid' => 'stale-write-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'write-target-user',
        'subject_uuid' => 'write-target-user',
        'role' => 'user',
    ]);

    $this->withToken(adminToken($admin, now()->subMinutes(30)->timestamp))
        ->postJson('/admin/api/users/write-target-user/lock', ['reason' => 'audit-test'])
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required');
});

it('returns 428 reauth_required for stale destructive admin actions', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'step-up-admin',
        'subject_uuid' => 'step-up-admin',
        'role' => 'admin',
    ]);

    seedRevocableSession('session-step-up', 'subject-1001');

    $this->withToken(adminToken($admin, now()->subMinutes(20)->timestamp))
        ->deleteJson('/admin/api/sessions/session-step-up')
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required');

    assertLatestAudit('session_management', 'step_up_required', 'stale_auth_rejected');
});

it('returns 428 reauth_required when revoke-all is attempted with a stale admin session', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'stale-revoke-all-admin',
        'subject_uuid' => 'stale-revoke-all-admin',
        'role' => 'admin',
    ]);

    seedRevocableSession('session-step-up-all', 'subject-2002');

    $this->withToken(adminToken($admin, now()->subMinutes(20)->timestamp))
        ->deleteJson('/admin/api/users/subject-2002/sessions')
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required')
        ->assertJsonPath('error_description', 'Fresh authentication is required for this resource. Re-authenticate to meet the freshness precondition.');

    assertLatestAudit('session_management', 'step_up_required', 'stale_auth_rejected');
});

it('allows fresh token to perform privileged write within step_up window', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'fresh-write-admin',
        'subject_uuid' => 'fresh-write-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'fresh-write-target',
        'subject_uuid' => 'fresh-write-target',
        'role' => 'user',
    ]);

    // token with auth_time within step_up window (2 min old, window is 900s)
    $this->withToken(adminToken($admin, now()->subMinutes(2)->timestamp))
        ->postJson('/admin/api/users/fresh-write-target/lock', ['reason' => 'freshness-contract'])
        ->assertOk();
});

it('accepts re-issued token with fresh auth_time for step-up flow', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'reissued-admin',
        'subject_uuid' => 'reissued-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'reissued-target',
        'subject_uuid' => 'reissued-target',
        'role' => 'user',
    ]);

    // Simulate a stale token first
    $this->withToken(adminToken($admin, now()->subMinutes(20)->timestamp))
        ->postJson('/admin/api/users/reissued-target/lock', ['reason' => 'stale-attempt'])
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required');

    // Re-issued token with auth_time = time() (simulates CompleteSsoAuthorization after prompt=login)
    $this->withToken(adminToken($admin, now()->timestamp))
        ->postJson('/admin/api/users/reissued-target/lock', ['reason' => 'freshness-contract'])
        ->assertOk();
});

it('enforces step_up_seconds config value as the freshness window', function (): void {
    /** @var TestCase $this */
    config()->set('sso.admin.freshness.step_up_seconds', 900);

    /** @var AdminFreshnessPolicy $policy */
    $policy = app(AdminFreshnessPolicy::class);

    expect($policy->window('step_up'))->toBe(900);
    expect($policy->stale(time() - 600, 'step_up'))->toBeFalse();  // 10 min old < 900s window
    expect($policy->stale(time() - 1200, 'step_up'))->toBeTrue();   // 20 min old > 900s window
});

it('allows routine write with 20-minute-old token under write window', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'write-tier-admin',
        'subject_uuid' => 'write-tier-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'write-tier-target',
        'subject_uuid' => 'write-tier-target',
        'role' => 'user',
    ]);

    // syncProfile is :write tier — 20 min should pass under 1800s window
    $this->withToken(adminToken($admin, now()->subMinutes(20)->timestamp))
        ->postJson('/admin/api/users/write-tier-target/sync-profile')
        ->assertOk();
});

it('rejects routine write beyond write window', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'exceeded-write-admin',
        'subject_uuid' => 'exceeded-write-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'exceeded-write-target',
        'subject_uuid' => 'exceeded-write-target',
        'role' => 'user',
    ]);

    // 31 min exceeds write 1800s window
    $this->withToken(adminToken($admin, now()->subMinutes(31)->timestamp))
        ->postJson('/admin/api/users/exceeded-write-target/sync-profile')
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required');
});

it('rejects high-sensitivity action when step_up window expired but write window still valid', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'stepup-vs-write-admin',
        'subject_uuid' => 'stepup-vs-write-admin',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => 'stepup-vs-write-target',
        'subject_uuid' => 'stepup-vs-write-target',
        'role' => 'user',
    ]);

    // 16 min: within write window (1800s) but outside step_up window (900s)
    // lock is :step_up — should be rejected
    $this->withToken(adminToken($admin, now()->subMinutes(16)->timestamp))
        ->postJson('/admin/api/users/stepup-vs-write-target/lock', ['reason' => 'tier-test'])
        ->assertStatus(428)
        ->assertJsonPath('error', 'reauth_required');

    // But a routine write should still pass
    $this->withToken(adminToken($admin, now()->subMinutes(16)->timestamp))
        ->postJson('/admin/api/users/stepup-vs-write-target/sync-profile')
        ->assertOk();
});

it('exposes write_seconds window from config', function (): void {
    config()->set('sso.admin.freshness.write_seconds', 1800);

    /** @var AdminFreshnessPolicy $policy */
    $policy = app(AdminFreshnessPolicy::class);

    expect($policy->window('write'))->toBe(1800);
    expect($policy->stale(time() - 1200, 'write'))->toBeFalse();  // 20 min < 1800s
    expect($policy->stale(time() - 2100, 'write'))->toBeTrue();   // 35 min > 1800s
});

function adminToken(User $user, int $authTime): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => $authTime,
        'amr' => ['pwd'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

function seedRevocableSession(string $sessionId, string $subjectId): void
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
        'auth_time' => now()->subMinutes(10),
        'amr' => json_encode(['pwd'], JSON_THROW_ON_ERROR),
        'acr' => 'urn:example:loa:2',
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function assertLatestAudit(string $action, string $reason, string $taxonomy): void
{
    /** @var object $event */
    $event = DB::table('admin_audit_events')->orderByDesc('id')->first();

    expect($event->action)->toBe($action)
        ->and($event->outcome)->toBe('denied')
        ->and($event->reason)->toBe($reason)
        ->and($event->taxonomy)->toBe($taxonomy);
}
