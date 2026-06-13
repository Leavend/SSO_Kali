<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\MfaCredential;
use App\Models\Role;
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
            'locked_at',
            'locked_until',
            'locked_reason',
            'locked_by_subject_id',
            'lock_count',
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
        $user->loadMissing('roles');

        return [
            ...$user->only($this->columns()),
            'effective_status' => $user->effective_status,
            'mfa_enrolled' => MfaCredential::query()->forUser($user->id)->verified()->exists(),
            'mfa_methods' => MfaCredential::query()->forUser($user->id)->verified()->pluck('method')->unique()->values()->all(),
            'mfa_mandatory' => (bool) $user->mfa_mandatory,
            'roles' => $user->roles
                ->map(fn (Role $role): array => $role->only(['slug', 'name', 'is_system']))
                ->sortBy('slug')
                ->values()
                ->all(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function latestLoginContext(string $subjectId): ?array
    {
        $latestSession = $this->latestActiveSsoSession($subjectId);
        $ctx = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();

        if ($ctx === null) {
            return $latestSession === null ? null : [
                'ip_address' => $latestSession->ip_address,
                'mfa_required' => false,
                'last_seen_at' => $latestSession->last_seen_at ?? $latestSession->authenticated_at,
            ];
        }

        return [
            'ip_address' => $latestSession->ip_address ?? $ctx->ip_address,
            'mfa_required' => (bool) $ctx->mfa_required,
            'last_seen_at' => $latestSession->last_seen_at ?? $ctx->last_seen_at,
        ];
    }

    private function latestActiveSsoSession(string $subjectId): ?object
    {
        return DB::table('sso_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('last_seen_at')
            ->orderByDesc('authenticated_at')
            ->orderByDesc('id')
            ->first();
    }

    public function passwordReset(array $result): array
    {
        return [
            'user' => $this->user($result['user']),
            'password_reset' => [
                'expires_at' => $result['expires_at'],
            ],
            'delivery_status' => $result['delivery_status'],
        ];
    }
}
