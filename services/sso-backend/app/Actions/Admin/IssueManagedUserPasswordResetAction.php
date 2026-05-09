<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class IssueManagedUserPasswordResetAction
{
    /**
     * @return array{user: User, reset_token: string, expires_at: string}
     */
    public function execute(User $target): array
    {
        $token = Str::random(48);
        $expiresAt = now()->addMinutes(30);

        $target->forceFill([
            'password_reset_token_hash' => Hash::make($token),
            'password_reset_token_expires_at' => $expiresAt,
        ])->save();

        return [
            'user' => $target->refresh(),
            'reset_token' => $token,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }
}
