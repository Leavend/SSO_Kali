<?php

declare(strict_types=1);

use App\Actions\Profile\ConfirmEmailChangeAction;
use App\Models\ProfileChangeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

it('rejects expired email change tokens without consuming them', function (): void {
    Notification::fake();
    $token = Str::random(48);
    $change = emailChangeUnitRequest($token, now()->subMinute());

    app(ConfirmEmailChangeAction::class)->execute(Request::create('/api/profile/email-change/confirm', 'POST'), $token);
})->throws(ValidationException::class, 'Token perubahan email tidak valid atau kedaluwarsa.');

it('rejects mismatched email change tokens', function (): void {
    Notification::fake();
    emailChangeUnitRequest(Str::random(48), now()->addMinute());

    app(ConfirmEmailChangeAction::class)->execute(Request::create('/api/profile/email-change/confirm', 'POST'), Str::random(48));
})->throws(ValidationException::class, 'Token perubahan email tidak valid atau kedaluwarsa.');

function emailChangeUnitRequest(string $token, DateTimeInterface $expiresAt): ProfileChangeRequest
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => Str::random(10).'@email-change-unit.example.test',
        'password' => Hash::make('Password123!'),
        'display_name' => 'Email Change Unit',
        'given_name' => 'Email',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    return ProfileChangeRequest::query()->create([
        'user_id' => $user->id,
        'type' => ProfileChangeRequest::TYPE_EMAIL,
        'target_value' => Str::random(10).'@new.example.test',
        'token_hash' => Hash::make($token),
        'expires_at' => $expiresAt,
    ]);
}
