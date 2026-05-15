<?php

declare(strict_types=1);

use App\Models\User;
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
    config()->set('sso.admin.freshness.step_up_seconds', 300);
    config()->set('sso.admin.mfa.enforced', true);
    config()->set('sso.admin.mfa.accepted_amr', ['mfa']);
    // Existing tests cover AMR enforcement at the bootstrap layer; the admin
    // here intentionally has no enrolled credential. Allow the legacy grace
    // window so EnsureAdminMfaEnrolled does not short-circuit before the
    // AMR check this suite is designed to verify.
    config()->set('sso.admin.mfa.grace_period_hours', 72);
});

it('returns 403 mfa_required for admin bootstrap when the token lacks a second factor', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'mfa-admin-1',
        'subject_uuid' => 'mfa-admin-1',
        'role' => 'admin',
    ]);

    $this->withToken(adminMfaToken($admin, ['pwd']))
        ->getJson('/admin/api/me')
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_required')
        ->assertJsonPath('error_description', 'An additional verification factor is required for this resource.');

    assertLatestMfaAudit('admin_api');
});

it('allows admin bootstrap when MFA enforcement is enabled and the token contains mfa', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'mfa-admin-2',
        'subject_uuid' => 'mfa-admin-2',
        'role' => 'admin',
    ]);

    $this->withToken(adminMfaToken($admin, ['pwd', 'mfa']))
        ->getJson('/admin/api/me')
        ->assertOk()
        ->assertJsonPath('principal.auth_context.mfa_enforced', true)
        ->assertJsonPath('principal.auth_context.mfa_verified', true);
});

it('returns 403 mfa_required for destructive admin actions without a verified second factor', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'mfa-admin-3',
        'subject_uuid' => 'mfa-admin-3',
        'role' => 'admin',
    ]);

    DB::table('refresh_token_rotations')->insert([
        'subject_id' => 'subject-mfa-1',
        'subject_uuid' => 'subject-mfa-1',
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => 'refresh-mfa-1',
        'token_family_id' => 'family-mfa-1',
        'secret_hash' => 'hash',
        'scope' => 'openid profile email',
        'session_id' => 'session-mfa-1',
        'auth_time' => now()->subMinute(),
        'amr' => json_encode(['pwd'], JSON_THROW_ON_ERROR),
        'acr' => 'urn:example:loa:2',
        'upstream_refresh_token' => null,
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $this->withToken(adminMfaToken($admin, ['pwd']))
        ->deleteJson('/admin/api/sessions/session-mfa-1')
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_required');

    assertLatestMfaAudit('session_management');
});

function adminMfaToken(User $user, array $amr): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => $amr,
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

function assertLatestMfaAudit(string $action): void
{
    /** @var object $event */
    $event = DB::table('admin_audit_events')->orderByDesc('id')->first();

    expect($event->action)->toBe($action)
        ->and($event->outcome)->toBe('denied')
        ->and($event->reason)->toBe('mfa_required')
        ->and($event->taxonomy)->toBe('mfa_required');
}
