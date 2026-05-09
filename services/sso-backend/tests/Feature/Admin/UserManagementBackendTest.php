<?php

declare(strict_types=1);

use App\Actions\Admin\CreateManagedUserAction;
use App\Actions\Admin\DeactivateManagedUserAction;
use App\Actions\Admin\IssueManagedUserPasswordResetAction;
use App\Actions\Admin\ReactivateManagedUserAction;
use App\Actions\Admin\SyncManagedUserProfileAction;
use App\Models\AdminAuditEvent;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Support\Facades\Hash;

it('creates local fallback users without leaking plaintext passwords to audit context', function (): void {
    $user = app(CreateManagedUserAction::class)->execute([
        'email' => 'fallback@example.com',
        'display_name' => 'Fallback User',
        'given_name' => 'Fallback',
        'family_name' => 'User',
        'role' => 'user',
        'password' => 'very-secure-password',
        'local_account_enabled' => true,
    ]);

    expect($user->subject_id)->toStartWith('usr_')
        ->and($user->status)->toBe('active')
        ->and($user->local_account_enabled)->toBeTrue()
        ->and(Hash::check('very-secure-password', (string) $user->password))->toBeTrue();
});

it('deactivates and reactivates managed users while preventing self deactivation', function (): void {
    $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
    $target = User::factory()->create(['role' => 'user', 'status' => 'active']);

    $disabled = app(DeactivateManagedUserAction::class)->execute($target, $admin, 'policy violation');

    expect($disabled->status)->toBe('disabled')
        ->and($disabled->disabled_reason)->toBe('policy violation')
        ->and($disabled->disabled_at)->not->toBeNull();

    $active = app(ReactivateManagedUserAction::class)->execute($disabled);

    expect($active->status)->toBe('active')
        ->and($active->disabled_reason)->toBeNull()
        ->and($active->disabled_at)->toBeNull();

    expect(fn () => app(DeactivateManagedUserAction::class)->execute($admin, $admin, 'self'))
        ->toThrow(RuntimeException::class, 'Administrators cannot deactivate their own account.');
});

it('stores only a password reset token hash and returns the token once', function (): void {
    $target = User::factory()->create(['role' => 'user']);

    $result = app(IssueManagedUserPasswordResetAction::class)->execute($target);
    $target->refresh();

    expect($result['reset_token'])->toBeString()->not->toBe('')
        ->and($target->password_reset_token_hash)->not->toBe($result['reset_token'])
        ->and(Hash::check($result['reset_token'], (string) $target->password_reset_token_hash))->toBeTrue()
        ->and($target->password_reset_token_expires_at)->not->toBeNull();
});

it('syncs selected profile fields and timestamps the sync', function (): void {
    $target = User::factory()->create([
        'email' => 'old@example.com',
        'display_name' => 'Old Name',
    ]);

    $synced = app(SyncManagedUserProfileAction::class)->execute($target, [
        'email' => 'new@example.com',
        'display_name' => 'New Name',
        'given_name' => 'New',
        'family_name' => 'Name',
        'role' => 'admin',
    ]);

    expect($synced->email)->toBe('new@example.com')
        ->and($synced->display_name)->toBe('New Name')
        ->and($synced->given_name)->toBe('New')
        ->and($synced->role)->not->toBe('admin')
        ->and($synced->profile_synced_at)->not->toBeNull();
});

it('persists redacted admin audit context for user management actions', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);

    app(AdminAuditLogger::class)->succeeded(
        'create_managed_user',
        request(),
        $admin,
        ['email' => 'created@example.com', 'role' => 'user'],
        AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
    );

    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();

    expect($event->action)->toBe('create_managed_user')
        ->and($event->context)->toMatchArray(['email' => 'created@example.com', 'role' => 'user'])
        ->and(json_encode($event->context, JSON_THROW_ON_ERROR))->not->toContain('password');
});
