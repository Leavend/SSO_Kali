<?php

declare(strict_types=1);

use App\Actions\Admin\ValidateAdminMfaPolicyAction;
use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Tests\TestCase;

/**
 * BE-FR018-001 — Admin MFA grace period must not be permissive in production.
 *
 * Acceptance criteria locked here:
 *   1. Production default `ADMIN_MFA_GRACE_PERIOD_HOURS` is 0.
 *   2. Even if env is misconfigured, production runtime clamps grace to 0.
 *   3. Admin without MFA cannot reach privileged routes in production.
 *   4. Admin with verified MFA can reach privileged routes.
 *   5. Deploy guard `sso:check-admin-mfa-policy` fails in misconfigured prod
 *      and passes when policy is safe.
 *   6. Non-production keeps the grace period for dev ergonomics.
 */
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
});

it('ships the production-safe default grace period of zero hours', function (): void {
    /** @var TestCase $this */
    $config = require base_path('config/sso.php');

    expect($config['admin']['mfa']['grace_period_hours'])->toBe(0);
});

it('blocks an unenrolled admin from privileged routes in production even when env tries to extend the grace period', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.grace_period_hours', 168);

    $admin = adminMfaPolicyUser('mfa-grace-prod-1');

    $this->withToken(adminMfaPolicyToken($admin, ['pwd', 'mfa']))
        ->getJson('/admin/api/me')
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_enrollment_required');
});

it('allows an enrolled admin to reach privileged routes in production', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.grace_period_hours', 0);

    $admin = adminMfaPolicyUser('mfa-grace-prod-2');

    MfaCredential::query()->create([
        'user_id' => $admin->id,
        'method' => 'totp',
        'label' => 'Authenticator',
        'secret' => 'JBSWY3DPEHPK3PXP',
        'verified_at' => now(),
    ]);

    $this->withToken(adminMfaPolicyToken($admin, ['pwd', 'mfa']))
        ->getJson('/admin/api/me')
        ->assertOk()
        ->assertJsonPath('principal.auth_context.mfa_verified', true);
});

it('honours the configured grace period for unenrolled admins in non-production', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'staging');
    config()->set('sso.admin.mfa.grace_period_hours', 72);

    $admin = adminMfaPolicyUser('mfa-grace-staging-1');

    $this->withToken(adminMfaPolicyToken($admin, ['pwd', 'mfa']))
        ->getJson('/admin/api/me')
        ->assertOk();
});

it('flags misconfigured production policy via the deploy guard action', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.enforced', true);
    config()->set('sso.admin.mfa.grace_period_hours', 24);

    $result = app(ValidateAdminMfaPolicyAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and($result['environment'])->toBe('production')
        ->and(implode("\n", $result['errors']))
        ->toContain('grace period must be 0');
});

it('returns valid for a safe production policy', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.enforced', true);
    config()->set('sso.admin.mfa.grace_period_hours', 0);
    config()->set('sso.admin.mfa.accepted_amr', ['mfa']);

    $result = app(ValidateAdminMfaPolicyAction::class)->execute();

    expect($result['valid'])->toBeTrue()
        ->and($result['errors'])->toBe([]);
});

it('exposes a non-zero exit code from the deploy guard command on misconfigured production', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('sso.admin.mfa.grace_period_hours', 48);

    $this->artisan('sso:check-admin-mfa-policy')
        ->assertExitCode(1);
});

it('passes the deploy guard command for safe production configuration', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('sso.admin.mfa.enforced', true);
    config()->set('sso.admin.mfa.grace_period_hours', 0);
    config()->set('sso.admin.mfa.accepted_amr', ['mfa']);

    $this->artisan('sso:check-admin-mfa-policy')
        ->assertExitCode(0);
});

function adminMfaPolicyUser(string $subjectId): User
{
    return User::factory()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'role' => 'admin',
        'created_at' => now(),
    ]);
}

function adminMfaPolicyToken(User $user, array $amr): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-mfa-policy-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => $amr,
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
