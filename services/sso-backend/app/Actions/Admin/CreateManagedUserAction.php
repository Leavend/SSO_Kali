<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Notifications\PasswordResetRequestedNotification;
use App\Support\Admin\SingleRoleAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class CreateManagedUserAction
{
    public function __construct(
        private readonly SingleRoleAssignment $singleRoleAssignment,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{user: User, delivery_status: string}
     */
    public function execute(array $data): array
    {
        $sendReset = false;
        $rawToken = null;
        $expiresAt = null;

        $user = DB::transaction(function () use ($data, &$sendReset, &$rawToken, &$expiresAt): User {
            $user = User::query()->create([
                'subject_id' => $this->subjectId(),
                'email' => $data['email'],
                'password' => $data['password'] ?? null,
                'given_name' => $data['given_name'] ?? null,
                'family_name' => $data['family_name'] ?? null,
                'display_name' => $data['display_name'],
                'role' => $data['role'],
                'status' => 'active',
                'local_account_enabled' => (bool) ($data['local_account_enabled'] ?? false),
                'email_verified_at' => now(),
                'nik' => $data['nik'] ?? null,
                'nip' => $data['nip'] ?? null,
                'nisn' => $data['nisn'] ?? null,
                'birth_date' => $data['birth_date'] ?? null,
            ]);

            $this->attachRole($user, (string) $data['role']);

            if ($user->local_account_enabled && blank($data['password'] ?? null)) {
                $rawToken = Str::random(48);
                $expiresAt = now()->addMinutes((int) config('sso.auth.password_reset_ttl_minutes', 30));

                $user->forceFill([
                    'password_reset_token_hash' => Hash::make($rawToken),
                    'password_reset_token_expires_at' => $expiresAt,
                ])->save();

                $sendReset = true;
            }

            return $user;
        });

        $deliveryStatus = 'none';

        if ($sendReset && $rawToken && $expiresAt) {
            try {
                $user->notify(new PasswordResetRequestedNotification($rawToken, $expiresAt));
                $deliveryStatus = 'queued';
            } catch (\Throwable $e) {
                $deliveryStatus = 'failed';
                Log::warning('Failed to dispatch password reset notification for newly created user.', [
                    'user_id' => $user->subject_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'user' => $user->refresh(),
            'delivery_status' => $deliveryStatus,
        ];
    }

    private function subjectId(): string
    {
        do {
            $subjectId = 'usr_'.Str::lower(Str::random(24));
        } while (User::query()->where('subject_id', $subjectId)->exists());

        return $subjectId;
    }

    private function attachRole(User $user, string $roleSlug): void
    {
        $this->singleRoleAssignment->assign($user, $roleSlug);
    }
}
