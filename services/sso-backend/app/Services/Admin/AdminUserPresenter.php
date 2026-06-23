<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\MfaCredential;
use App\Models\Role;
use App\Models\User;
use App\Support\Identity\GovernmentIdentifier;
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
            'nik',
            'nip',
            'nisn',
            'birth_date',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function user(User $user): array
    {
        $methods = MfaCredential::query()->forUser($user->id)->verified()->pluck('method')->all();

        return $this->userWithMfaMethods($user, $methods);
    }

    /**
     * @param  array<int, string>  $methods
     * @return array<string, mixed>
     */
    public function userWithMfaMethods(User $user, array $methods): array
    {
        $user->loadMissing('roles');
        $methods = array_values(array_unique($methods));

        $data = $user->only($this->publicColumns());

        return [
            ...$data,
            ...$this->staffIdentity($user),
            'effective_status' => $user->effective_status,
            'mfa_enrolled' => $methods !== [],
            'mfa_methods' => $methods,
            'mfa_mandatory' => (bool) $user->mfa_mandatory,
            'roles' => $this->roles($user),
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

        $sessionIpAddress = $latestSession === null ? null : $latestSession->ip_address;
        $sessionLastSeenAt = $latestSession === null ? null : $latestSession->last_seen_at;

        return [
            'ip_address' => $sessionIpAddress ?? $ctx->ip_address,
            'mfa_required' => (bool) $ctx->mfa_required,
            'last_seen_at' => $sessionLastSeenAt ?? $ctx->last_seen_at,
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

    /**
     * @return array<int, array<string, mixed>>
     */
    private function roles(User $user): array
    {
        return $user->roles
            ->map(fn (Role $role): array => $role->only(['slug', 'name', 'is_system']))
            ->sortBy('slug')
            ->values()
            ->all();
    }

    /**
     * @return array<string>
     */
    private function publicColumns(): array
    {
        return array_values(array_diff($this->columns(), ['nik', 'nip', 'nisn', 'birth_date']));
    }

    /**
     * @return array<string, string|null>
     */
    private function staffIdentity(User $user): array
    {
        return [
            'nik' => $this->maskedIdentifier($user, 'nik'),
            'nip' => $this->maskedIdentifier($user, 'nip'),
            'nisn' => $this->maskedIdentifier($user, 'nisn'),
            'birth_date' => $this->maskedBirthDate($user),
        ];
    }

    private function maskedIdentifier(User $user, string $attribute): ?string
    {
        if ($user->getRawOriginal($attribute) === null) {
            return null;
        }

        return GovernmentIdentifier::maskFrom(fn (): mixed => $user->getAttribute($attribute));
    }

    private function maskedBirthDate(User $user): ?string
    {
        if ($user->getRawOriginal('birth_date') === null) {
            return null;
        }

        return GovernmentIdentifier::maskBirthDateFrom(fn (): mixed => $user->birth_date);
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
