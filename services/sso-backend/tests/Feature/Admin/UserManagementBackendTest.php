<?php

declare(strict_types=1);

use App\Actions\Admin\CreateManagedUserAction;
use App\Actions\Admin\DeactivateManagedUserAction;
use App\Actions\Admin\IssueManagedUserPasswordResetAction;
use App\Actions\Admin\ReactivateManagedUserAction;
use App\Actions\Admin\SyncManagedUserProfileAction;
use App\Models\AdminAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\PasswordResetRequestedNotification;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminUserPresenter;
use App\Services\Oidc\LocalTokenService;
use App\Services\Security\LoginContextRecorder;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

it('creates local fallback users without leaking plaintext passwords to audit context', function (): void {
    $result = app(CreateManagedUserAction::class)->execute([
        'email' => 'fallback@example.com',
        'display_name' => 'Fallback User',
        'given_name' => 'Fallback',
        'family_name' => 'User',
        'role' => 'user',
        'password' => 'very-secure-password',
        'local_account_enabled' => true,
    ]);

    $user = $result['user'];

    expect($result['delivery_status'])->toBe('none')
        ->and($user->subject_id)->toStartWith('usr_')
        ->and($user->status)->toBe('active')
        ->and($user->local_account_enabled)->toBeTrue()
        ->and(Hash::check('very-secure-password', (string) $user->password))->toBeTrue();
});

it('queues activation instructions when a local user is created without a password', function (): void {
    Notification::fake();

    $result = app(CreateManagedUserAction::class)->execute([
        'email' => 'activation@example.com',
        'display_name' => 'Activation User',
        'role' => 'user',
        'local_account_enabled' => true,
    ]);

    $user = $result['user'];

    expect($result['delivery_status'])->toBe('queued')
        ->and($user->password)->toBeNull()
        ->and($user->password_reset_token_hash)->not->toBeNull()
        ->and($user->password_reset_token_expires_at)->not->toBeNull();

    Notification::assertSentTo($user, PasswordResetRequestedNotification::class);
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
        'email_verified_at' => now(),
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
        ->and($synced->email_verified_at)->toBeNull()
        ->and($synced->profile_synced_at)->not->toBeNull();
});

it('composes display name and stores only first name words during profile sync', function (): void {
    $target = User::factory()->create([
        'email' => 'profile-sync@example.com',
        'display_name' => 'Legacy Display',
        'given_name' => 'Legacy Given',
        'family_name' => 'Legacy Family',
    ]);

    $synced = app(SyncManagedUserProfileAction::class)->execute($target, [
        'display_name' => 'Ignored Manual Display',
        'given_name' => 'Tio Hady',
        'family_name' => 'Pranoto Family',
    ]);

    expect($synced->display_name)->toBe('Tio Pranoto')
        ->and($synced->given_name)->toBe('Tio')
        ->and($synced->family_name)->toBe('Pranoto');
});

it('ignores blank profile name sync inputs without clearing composed names', function (): void {
    $target = User::factory()->create([
        'email' => 'blank-profile-sync@example.com',
        'display_name' => 'Tio Pranoto',
        'given_name' => 'Tio',
        'family_name' => 'Pranoto',
    ]);

    $synced = app(SyncManagedUserProfileAction::class)->execute($target, [
        'given_name' => '',
        'family_name' => '',
    ]);

    expect($synced->display_name)->toBe('Tio Pranoto')
        ->and($synced->given_name)->toBe('Tio')
        ->and($synced->family_name)->toBe('Pranoto')
        ->and($synced->profile_synced_at)->not->toBeNull();
});

it('preserves email verification when admin sync does not change email', function (): void {
    $verifiedAt = now()->subDay();
    $target = User::factory()->create([
        'email' => 'same@example.com',
        'display_name' => 'Old Name',
        'email_verified_at' => $verifiedAt,
    ]);

    $synced = app(SyncManagedUserProfileAction::class)->execute($target, [
        'display_name' => 'New Name',
    ]);

    expect($synced->email)->toBe('same@example.com')
        ->and($synced->email_verified_at?->timestamp)->toBe($verifiedAt->timestamp);
});

it('includes email verification status in admin user presentation', function (): void {
    $target = User::factory()->create(['email_verified_at' => now()]);

    expect(app(AdminUserPresenter::class)->user($target))
        ->toHaveKey('email_verified_at');
});

it('backfills legacy profile names from display names', function (): void {
    $missing = User::factory()->create([
        'display_name' => 'Tio Hady Pranoto',
        'given_name' => null,
        'family_name' => null,
    ]);
    $multiWordGiven = User::factory()->create([
        'display_name' => 'Sari Dewi',
        'given_name' => 'Sari Middle',
        'family_name' => null,
    ]);
    $clean = User::factory()->create([
        'display_name' => 'Ada Lovelace',
        'given_name' => 'Ada',
        'family_name' => 'Lovelace',
    ]);

    $migration = require database_path('migrations/2026_06_10_000001_backfill_user_profile_names.php');
    $migration->up();
    $migration->up();

    expect($missing->refresh()->given_name)->toBe('Tio')
        ->and($missing->family_name)->toBe('Pranoto')
        ->and($missing->display_name)->toBe('Tio Pranoto')
        ->and($multiWordGiven->refresh()->given_name)->toBe('Sari')
        ->and($multiWordGiven->family_name)->toBe('Dewi')
        ->and($clean->refresh()->given_name)->toBe('Ada')
        ->and($clean->family_name)->toBe('Lovelace');
});

it('returns first new login last_login_at in admin user show response immediately', function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);

    $admin = User::factory()->create(['role' => 'admin']);
    $target = User::factory()->create(['last_login_at' => null]);

    app(LoginContextRecorder::class)->record(
        $target,
        '203.0.113.77',
        'Mozilla/5.0 Immediate Login',
        ['pwd'],
    );

    $response = $this->withToken(adminUserShowAccessToken($admin))
        ->getJson('/admin/api/users/'.$target->subject_id)
        ->assertOk()
        ->assertJsonPath('user.subject_id', $target->subject_id);

    expect($response->json('user.last_login_at'))->not->toBeNull();
});

it('uses latest active SSO session IP as admin user login context evidence', function (): void {
    $target = User::factory()->create(['role' => 'user']);

    DB::table('login_contexts')->insert([
        'subject_id' => $target->subject_id,
        'ip_address' => null,
        'mfa_required' => false,
        'last_seen_at' => now()->subMinutes(10),
        'created_at' => now()->subMinutes(10),
        'updated_at' => now()->subMinutes(10),
    ]);

    SsoSession::query()->create([
        'session_id' => 'sess-admin-context-ip',
        'user_id' => $target->id,
        'subject_id' => $target->subject_id,
        'ip_address' => '182.8.164.167',
        'user_agent' => 'Mozilla/5.0',
        'authenticated_at' => now()->subMinute(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    expect(app(AdminUserPresenter::class)->latestLoginContext($target->subject_id))
        ->toMatchArray([
            'ip_address' => '182.8.164.167',
            'mfa_required' => false,
        ]);

    expect(app(AdminUserPresenter::class)->latestLoginContext($target->subject_id))
        ->not->toHaveKey('risk_score');
});

it('builds admin login context from active SSO session when login context is absent', function (): void {
    $target = User::factory()->create(['role' => 'user']);

    SsoSession::query()->create([
        'session_id' => 'sess-admin-context-only',
        'user_id' => $target->id,
        'subject_id' => $target->subject_id,
        'ip_address' => '203.0.113.88',
        'user_agent' => 'Mozilla/5.0',
        'authenticated_at' => now()->subMinute(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    expect(app(AdminUserPresenter::class)->latestLoginContext($target->subject_id))
        ->toMatchArray([
            'ip_address' => '203.0.113.88',
            'mfa_required' => false,
        ]);

    expect(app(AdminUserPresenter::class)->latestLoginContext($target->subject_id))
        ->not->toHaveKey('risk_score');
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

function adminUserShowAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-user-show-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

it('rolls back user creation and does not send password reset notification if user creation fails', function (): void {
    Notification::fake();

    User::factory()->create(['email' => 'duplicate@example.com']);

    try {
        app(CreateManagedUserAction::class)->execute([
            'email' => 'duplicate@example.com',
            'display_name' => 'Duplicate User',
            'role' => 'user',
            'local_account_enabled' => true,
        ]);
        $this->fail('Expected QueryException to be thrown');
    } catch (QueryException $e) {
        // Expected
    }

    Notification::assertNothingSent();
});

it('creates the user successfully even if the activation/password-reset instruction fails to dispatch', function (): void {
    $mockDispatcher = Mockery::mock(Dispatcher::class);
    $mockDispatcher->shouldReceive('send')->andThrow(new RuntimeException('Queue connection failed'));
    $this->app->instance(Dispatcher::class, $mockDispatcher);

    $result = app(CreateManagedUserAction::class)->execute([
        'email' => 'nonfatal@example.com',
        'display_name' => 'Nonfatal User',
        'role' => 'user',
        'local_account_enabled' => true,
    ]);

    $user = $result['user'];

    expect($result['delivery_status'])->toBe('failed')
        ->and($user->subject_id)->toStartWith('usr_')
        ->and($user->status)->toBe('active')
        ->and($user->local_account_enabled)->toBeTrue();
});

it('rolls back user creation if saving the reset token fails', function (): void {
    Hash::shouldReceive('make')
        ->once()
        ->andThrow(new RuntimeException('Hash generation failed'));

    try {
        app(CreateManagedUserAction::class)->execute([
            'email' => 'rollback-token@example.com',
            'display_name' => 'Rollback Token User',
            'role' => 'user',
            'local_account_enabled' => true,
        ]);
        $this->fail('Expected RuntimeException to be thrown');
    } catch (RuntimeException $e) {
        expect($e->getMessage())->toBe('Hash generation failed');
    }

    $this->assertDatabaseMissing('users', ['email' => 'rollback-token@example.com']);
});
