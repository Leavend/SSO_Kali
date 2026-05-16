<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\PasswordChangedNotification;
use App\Notifications\PasswordResetRequestedNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

it('issues reset instructions without user enumeration and stores only a token hash', function (): void {
    Notification::fake();
    $user = User::factory()->create([
        'email' => 'resettable@example.test',
        'password' => Hash::make('OldPassword123!'),
        'local_account_enabled' => true,
    ]);

    $this->postJson('/api/auth/password-reset', ['email' => 'resettable@example.test'])
        ->assertOk()
        ->assertJsonPath('sent', true)
        ->assertJsonPath('message', 'Jika email terdaftar, instruksi reset password akan dikirim.');

    $user->refresh();
    expect($user->password_reset_token_hash)->not->toBeNull()
        ->and($user->password_reset_token_hash)->not->toContain('resettable@example.test')
        ->and($user->password_reset_token_expires_at)->not->toBeNull();

    Notification::assertSentTo($user, PasswordResetRequestedNotification::class);

    $this->postJson('/api/auth/password-reset', ['email' => 'missing@example.test'])
        ->assertOk()
        ->assertJsonPath('sent', true);
});

it('confirms reset token, revokes active sessions, and sends a security notification', function (): void {
    Notification::fake();
    $token = Str::random(48);
    $user = User::factory()->create([
        'email' => 'confirm-reset@example.test',
        'password' => Hash::make('OldPassword123!'),
        'password_reset_token_hash' => Hash::make($token),
        'password_reset_token_expires_at' => now()->addMinutes(30),
        'local_account_enabled' => true,
    ]);
    SsoSession::query()->create([
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'session_id' => 'reset-session-1',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
        'revoked_at' => null,
    ]);

    $this->postJson('/api/auth/password-reset/confirm', [
        'email' => 'confirm-reset@example.test',
        'token' => $token,
        'password' => 'NewSecure456!',
        'password_confirmation' => 'NewSecure456!',
    ])->assertOk()
        ->assertJsonPath('message', 'Password berhasil direset. Semua sesi aktif telah dicabut.')
        ->assertJsonPath('sessions_revoked', true);

    $user->refresh();
    expect(Hash::check('NewSecure456!', $user->password))->toBeTrue()
        ->and($user->password_reset_token_hash)->toBeNull()
        ->and($user->password_reset_token_expires_at)->toBeNull()
        ->and($user->password_changed_at)->not->toBeNull()
        ->and(SsoSession::query()->where('session_id', 'reset-session-1')->value('revoked_at'))->not->toBeNull();

    Notification::assertSentTo($user, PasswordChangedNotification::class);
});

it('rejects invalid reset tokens with field-level safe validation errors', function (): void {
    User::factory()->create([
        'email' => 'invalid-reset@example.test',
        'password_reset_token_hash' => Hash::make(Str::random(48)),
        'password_reset_token_expires_at' => now()->subMinute(),
    ]);

    $this->postJson('/api/auth/password-reset/confirm', [
        'email' => 'invalid-reset@example.test',
        'token' => Str::random(48),
        'password' => 'NewSecure456!',
        'password_confirmation' => 'NewSecure456!',
    ])->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'Token reset tidak valid atau kedaluwarsa.');
});
