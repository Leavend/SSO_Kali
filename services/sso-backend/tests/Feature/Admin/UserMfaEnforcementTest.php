<?php

declare(strict_types=1);

use App\Actions\Admin\RequireUserMfaAction;
use App\Actions\Admin\UnrequireUserMfaAction;
use App\Models\AdminAuditEvent;
use App\Models\User;
use App\Services\Admin\AdminUserPresenter;

it('requires and unrequires MFA for managed users, preventing self mandate/waive', function (): void {
    $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
    $target = User::factory()->create(['role' => 'user', 'status' => 'active', 'mfa_mandatory' => false]);

    // Check require MFA action
    $updated = app(RequireUserMfaAction::class)->execute($target, $admin, request(), 'Security policy mandate');

    expect($updated->mfa_mandatory)->toBeTrue();

    // Check unrequire MFA action
    $updated = app(UnrequireUserMfaAction::class)->execute($updated, $admin, request(), 'Security policy waive');

    expect($updated->mfa_mandatory)->toBeFalse();

    // Prevent self requirement
    expect(fn () => app(RequireUserMfaAction::class)->execute($admin, $admin, request(), 'Self mandate'))
        ->toThrow(RuntimeException::class, 'Administrators cannot mandate MFA on their own account.');

    // Prevent self waive
    expect(fn () => app(UnrequireUserMfaAction::class)->execute($admin, $admin, request(), 'Self waive'))
        ->toThrow(RuntimeException::class, 'Administrators cannot waive MFA on their own account.');
});

it('includes mfa fields in admin user presenter output', function (): void {
    $target = User::factory()->create(['mfa_mandatory' => true]);

    $presented = app(AdminUserPresenter::class)->user($target);

    expect($presented)->toHaveKey('mfa_mandatory', true)
        ->and($presented)->toHaveKey('mfa_enrolled', false)
        ->and($presented)->toHaveKey('mfa_methods', []);
});

it('creates admin audit trail for MFA enforcement actions', function (): void {
    $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
    $target = User::factory()->create(['role' => 'user', 'status' => 'active']);

    app(RequireUserMfaAction::class)->execute($target, $admin, request(), 'Mandating MFA for testing');

    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();

    expect($event->action)->toBe('require_user_mfa')
        ->and($event->context)->toMatchArray([
            'target_subject_id' => $target->subject_id,
            'reason' => 'Mandating MFA for testing',
        ]);
});
