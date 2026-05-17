<?php

declare(strict_types=1);

use App\Models\ProfileChangeRequest;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\PhoneChangeRequestedNotification;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification as NotificationFake;
use Illuminate\Support\Str;

it('requests and confirms a phone change using hashed OTP', function (): void {
    NotificationFake::fake();
    [$user, $cookie] = phoneChangeSession('phone-change', 'OldPassword123!');

    $request = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/phone-change', [
            'new_phone' => '+6281234567890',
            'current_password' => 'OldPassword123!',
        ]);

    $request->assertOk()->assertJsonStructure(['request' => ['expires_at']]);
    $change = ProfileChangeRequest::query()->where('user_id', $user->id)->firstOrFail();
    expect($change->target_value)->toBe('+6281234567890')
        ->and($change->otp_hash)->not->toBeNull()
        ->and($change->otp_hash)->not->toContain('+6281234567890');

    $otp = phoneNotificationSecret($user, PhoneChangeRequestedNotification::class, 'otp');
    $confirm = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/phone-change/confirm', ['otp' => $otp]);

    $confirm->assertOk()
        ->assertJsonPath('profile.phone', '+6281234567890')
        ->assertJsonStructure(['profile' => ['changed_at']]);

    $user->refresh();
    expect($user->phone)->toBe('+6281234567890')
        ->and($user->phone_verified_at)->not->toBeNull()
        ->and(ProfileChangeRequest::query()->whereKey($change->id)->value('consumed_at'))->not->toBeNull();
});

it('rejects wrong phone change OTP and preserves profile', function (): void {
    NotificationFake::fake();
    [$user, $cookie] = phoneChangeSession('phone-wrong-otp', 'OldPassword123!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/phone-change', [
            'new_phone' => '+6282222222222',
            'current_password' => 'OldPassword123!',
        ])->assertOk();

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/phone-change/confirm', ['otp' => '000000'])
        ->assertStatus(422)
        ->assertJsonPath('errors.otp.0', 'Kode OTP tidak valid atau kedaluwarsa.');

    $user->refresh();
    expect($user->phone)->toBeNull();
});

/** @return array{0: User, 1: string} */
function phoneChangeSession(string $id, string $password): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $id.'@profile-change.example.test',
        'password' => Hash::make($password),
        'display_name' => 'Phone Change User',
        'given_name' => 'Phone',
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

function phoneNotificationSecret(User $user, string $notificationClass, string $property): string
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
