<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Facades\DB;

final class AdminUserPresenter
{
    /**
     * @return array<string>
     */
    public function columns(): array
    {
        return [
            'id',
            'subject_id',
            'email',
            'given_name',
            'family_name',
            'display_name',
            'role',
            'status',
            'disabled_at',
            'disabled_reason',
            'local_account_enabled',
            'profile_synced_at',
            'email_verified_at',
            'last_login_at',
            'created_at',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function user(User $user): array
    {
        return $user->only($this->columns());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function latestLoginContext(string $subjectId): ?array
    {
        $ctx = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();

        if ($ctx === null) {
            return null;
        }

        return [
            'ip_address' => $ctx->ip_address,
            'risk_score' => $ctx->risk_score,
            'mfa_required' => (bool) $ctx->mfa_required,
            'last_seen_at' => $ctx->last_seen_at,
        ];
    }

    /**
     * @param  array{user: User, reset_token: string, expires_at: string}  $result
     * @return array<string, mixed>
     */
    public function passwordReset(array $result): array
    {
        return [
            'user' => $this->user($result['user']),
            'password_reset' => [
                'token' => $result['reset_token'],
                'expires_at' => $result['expires_at'],
            ],
        ];
    }
}
