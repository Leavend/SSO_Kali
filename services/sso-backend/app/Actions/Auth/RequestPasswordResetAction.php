<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Notifications\PasswordResetRequestedNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class RequestPasswordResetAction
{
    public function execute(string $email): void
    {
        $user = User::query()->where('email', mb_strtolower(trim($email)))->first();

        if (! $user instanceof User || $user->disabled_at !== null || $user->local_account_enabled === false) {
            return;
        }

        $token = Str::random(48);
        $expiresAt = now()->addMinutes((int) config('sso.auth.password_reset_ttl_minutes', 30));

        $user->forceFill([
            'password_reset_token_hash' => Hash::make($token),
            'password_reset_token_expires_at' => $expiresAt,
        ])->save();

        $user->notify(new PasswordResetRequestedNotification($token, $expiresAt));
    }
}
