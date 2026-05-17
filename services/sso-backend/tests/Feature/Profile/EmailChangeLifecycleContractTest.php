<?php

declare(strict_types=1);

use App\Models\ProfileChangeRequest;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Notifications\EmailChangeRequestedNotification;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification as NotificationFake;
use Illuminate\Support\Str;

it('requests and confirms an email change using only hashed confirmation token', function (): void {
    NotificationFake::fake();
    [$user, $cookie] = profileChangeSession('email-change', 'OldPassword123!');

    $request = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/email-change', [
            'new_email' => 'new-email@example.test',
            'current_password' => 'OldPassword123!',
        ]);

    $request->assertOk()->assertJsonStructure(['request' => ['expires_at']]);
    $change = ProfileChangeRequest::query()->where('user_id', $user->id)->firstOrFail();
    expect($change->target_value)->toBe('new-email@example.test')
        ->and($change->token_hash)->not->toBeNull()
        ->and($change->token_hash)->not->toContain('new-email@example.test')
        ->and($change->consumed_at)->toBeNull();

    $token = notificationSecret($user, EmailChangeRequestedNotification::class, 'token');
    $confirm = $this->postJson('/api/profile/email-change/confirm', ['token' => $token]);

    $confirm->assertOk()
        ->assertJsonPath('profile.email', 'new-email@example.test')
        ->assertJsonStructure(['profile' => ['changed_at']]);

    $user->refresh();
    expect($user->email)->toBe('new-email@example.test')
        ->and($user->email_verified_at)->toBeNull()
        ->and(ProfileChangeRequest::query()->whereKey($change->id)->value('consumed_at'))->not->toBeNull();

    NotificationFake::assertSentTo($user, EmailChangedNotification::class);
});

it('rejects invalid or replayed email change tokens safely', function (): void {
    NotificationFake::fake();
    [$user, $cookie] = profileChangeSession('email-replay', 'OldPassword123!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/email-change', [
            'new_email' => 'replay-email@example.test',
            'current_password' => 'OldPassword123!',
        ])->assertOk();

    $token = notificationSecret($user, EmailChangeRequestedNotification::class, 'token');
    $this->postJson('/api/profile/email-change/confirm', ['token' => $token])->assertOk();
    $this->postJson('/api/profile/email-change/confirm', ['token' => $token])
        ->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'Token perubahan email tidak valid atau kedaluwarsa.');
});

/** @return array{0: User, 1: string} */
function profileChangeSession(string $id, string $password): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $id.'@profile-change.example.test',
        'password' => Hash::make($password),
        'display_name' => 'Profile Change User',
        'given_name' => 'Profile',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
        'email_verified_at' => now(),
    ]);

    $sessionId = (string) Str::uuid();
    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addMinutes(60),
    ]);

    return [$user, $sessionId];
}

function notificationSecret(User $user, string $notificationClass, string $property): string
{
    $secret = null;
    NotificationFake::assertSentTo($user, $notificationClass, function (Notification $notification) use (&$secret, $property): bool {
        $reflection = new ReflectionProperty($notification, $property);
        $secret = $reflection->getValue($notification);

        return is_string($secret) && $secret !== '';
    });

    expect($secret)->toBeString();

    return (string) $secret;
}
