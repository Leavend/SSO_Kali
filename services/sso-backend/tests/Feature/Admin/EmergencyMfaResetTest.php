<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\MfaCredential;
use App\Models\User;
use App\Notifications\MfaDisabledNotification;
use App\Services\Mfa\RecoveryCodeService;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

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
    // EmergencyMfaResetTest exercises the reset endpoint itself; the
    // requesting admin here is intentionally unenrolled. Restore the
    // legacy grace window so the route is reachable.
    config()->set('sso.admin.mfa.grace_period_hours', 72);

    $this->admin = User::factory()->create([
        'subject_id' => 'emergency-admin',
        'subject_uuid' => 'emergency-admin',
        'role' => 'admin',
    ]);

    $this->targetUser = User::factory()->create([
        'subject_id' => 'target-user-mfa',
        'subject_uuid' => 'target-user-mfa',
    ]);

    $this->recoveryCodes = app(RecoveryCodeService::class);
});

describe('POST /admin/api/users/{subjectId}/reset-mfa', function (): void {
    it('removes MFA credential and recovery codes for target user', function (): void {
        Notification::fake();

        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->targetUser->getKey(),
        ]);
        $this->recoveryCodes->generate($this->targetUser->getKey());

        expect(MfaCredential::query()->forUser($this->targetUser->getKey())->exists())->toBeTrue();
        expect($this->recoveryCodes->remaining($this->targetUser->getKey()))->toBe(8);

        $response = $this->withToken(emergencyAdminToken($this->admin))
            ->postJson("/admin/api/users/{$this->targetUser->subject_id}/reset-mfa");

        $response->assertOk();
        $response->assertJsonPath('reset', true);
        $response->assertJsonPath('message', 'MFA credential removed.');

        expect(MfaCredential::query()->forUser($this->targetUser->getKey())->exists())->toBeFalse();
        expect($this->recoveryCodes->remaining($this->targetUser->getKey()))->toBe(0);

        Notification::assertSentTo($this->targetUser, MfaDisabledNotification::class, function ($notification) {
            $mail = $notification->toMail($this->targetUser);
            $rendered = implode(' ', $mail->introLines);

            return str_contains($rendered, 'administrator');
        });
    });

    it('returns error when user has no MFA enrolled', function (): void {
        $response = $this->withToken(emergencyAdminToken($this->admin))
            ->postJson("/admin/api/users/{$this->targetUser->subject_id}/reset-mfa");

        $response->assertUnprocessable();
    });

    it('returns 404 for non-existent user', function (): void {
        $response = $this->withToken(emergencyAdminToken($this->admin))
            ->postJson('/admin/api/users/non-existent-id/reset-mfa');

        $response->assertNotFound();
    });

    it('rejects request without admin token', function (): void {
        $response = $this->postJson("/admin/api/users/{$this->targetUser->subject_id}/reset-mfa");

        $response->assertUnauthorized();
    });
});

function emergencyAdminToken(User $user): string
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
