<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Notifications\PasswordResetRequestedNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class IssueManagedUserPasswordResetAction
{
    /**
     * @return array{user: User, reset_token: string, expires_at: string, delivery_status: string}
     */
    public function execute(User $target): array
    {
        $token = Str::random(48);
        $expiresAt = now()->addMinutes((int) config('sso.auth.password_reset_ttl_minutes', 30));

        $target->forceFill([
            'password_reset_token_hash' => Hash::make($token),
            'password_reset_token_expires_at' => $expiresAt,
        ])->save();

        $deliveryStatus = 'none';

        if ($target->local_account_enabled) {
            try {
                $target->notify(new PasswordResetRequestedNotification($token, $expiresAt));
                $deliveryStatus = 'queued';
            } catch (\Throwable $e) {
                $deliveryStatus = 'failed';
                Log::warning('Failed to dispatch password reset notification for user.', [
                    'user_id' => $target->subject_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'user' => $target->refresh(),
            'reset_token' => $token,
            'expires_at' => $expiresAt->toIso8601String(),
            'delivery_status' => $deliveryStatus,
        ];
    }
}
