<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use stdClass;

final class AdminUserQuery
{
    public function __construct(private readonly AdminUserPresenter $presenter) {}

    /**
     * @return Collection<int, mixed>
     */
    public function users(): Collection
    {
        $users = User::query()
            ->with('roles:id,slug,name,is_system')
            ->select($this->presenter->columns())
            ->orderByDesc('last_login_at')
            ->get();

        $subjects = $users->pluck('subject_id')->filter()->values();
        $userIds = $users->pluck('id')->filter()->values();
        $loginContexts = $this->latestLoginContexts($subjects);
        $sessions = $this->latestActiveSessions($subjects);
        $mfaMethods = $this->verifiedMfaMethods($userIds);

        return $users->map(fn (User $user): array => [
            ...$this->presenter->userWithMfaMethods($user, $mfaMethods->get($user->id, [])),
            'login_context' => $this->loginContext($loginContexts->get($user->subject_id), $sessions->get($user->subject_id)),
        ]);
    }

    public function find(string $subjectId): ?User
    {
        return User::query()->where('subject_id', $subjectId)->first();
    }

    /**
     * @param  Collection<int, string>  $subjects
     * @return Collection<int|string, stdClass>
     */
    private function latestLoginContexts(Collection $subjects): Collection
    {
        if ($subjects->isEmpty()) {
            return collect();
        }

        $latestIds = DB::table('login_contexts')
            ->selectRaw('MAX(id) as id')
            ->whereIn('subject_id', $subjects)
            ->groupBy('subject_id');

        return DB::table('login_contexts as lc')
            ->joinSub($latestIds, 'latest', fn ($join) => $join->on('lc.id', '=', 'latest.id'))
            ->get()
            ->keyBy('subject_id');
    }

    /**
     * @param  Collection<int, string>  $subjects
     * @return Collection<int|string, stdClass>
     */
    private function latestActiveSessions(Collection $subjects): Collection
    {
        if ($subjects->isEmpty()) {
            return collect();
        }

        return DB::table('sso_sessions')
            ->whereIn('subject_id', $subjects)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderBy('subject_id')
            ->orderByDesc('last_seen_at')
            ->orderByDesc('authenticated_at')
            ->orderByDesc('id')
            ->get()
            ->unique('subject_id')
            ->keyBy('subject_id');
    }

    /**
     * @param  Collection<int, int>  $userIds
     * @return Collection<int|string, array<int, string>>
     */
    private function verifiedMfaMethods(Collection $userIds): Collection
    {
        if ($userIds->isEmpty()) {
            return collect();
        }

        return DB::table('mfa_credentials')
            ->whereIn('user_id', $userIds)
            ->whereNotNull('verified_at')
            ->get(['user_id', 'method'])
            ->groupBy('user_id')
            ->map(fn (Collection $rows): array => $rows->pluck('method')
                ->filter(fn (mixed $method): bool => is_string($method))
                ->unique()
                ->values()
                ->all());
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loginContext(?stdClass $ctx, ?stdClass $session): ?array
    {
        if ($ctx === null) {
            return $session === null ? null : [
                'ip_address' => $session->ip_address,
                'mfa_required' => false,
                'last_seen_at' => $session->last_seen_at ?? $session->authenticated_at,
            ];
        }

        $sessionIpAddress = $session === null ? null : $session->ip_address;
        $sessionLastSeenAt = $session === null ? null : $session->last_seen_at;

        return [
            'ip_address' => $sessionIpAddress ?? $ctx->ip_address,
            'mfa_required' => (bool) $ctx->mfa_required,
            'last_seen_at' => $sessionLastSeenAt ?? $ctx->last_seen_at,
        ];
    }
}
