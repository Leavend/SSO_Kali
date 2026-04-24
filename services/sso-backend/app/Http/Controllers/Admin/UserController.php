<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Models\User;
use App\Services\Admin\AdminSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class UserController
{
    public function __construct(
        private readonly AdminSessionService $sessions,
    ) {}

    public function index(): JsonResponse
    {
        $users = User::query()
            ->select(['id', 'subject_id', 'email', 'display_name', 'role', 'last_login_at', 'created_at'])
            ->orderByDesc('last_login_at')
            ->get()
            ->map(fn (User $user): array => [
                ...$this->userPayload($user),
                'login_context' => $this->latestLoginContext($user->subject_id),
            ]);

        return response()->json(['users' => $users]);
    }

    public function show(string $subjectId): JsonResponse
    {
        $user = User::query()->where('subject_id', $subjectId)->first();

        if (! $user instanceof User) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return response()->json([
            'user' => $this->userPayload($user),
            'login_context' => $this->latestLoginContext($subjectId),
            'sessions' => $this->sessions->sessionsForUser($subjectId),
        ]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function latestLoginContext(string $subjectId): ?array
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
     * @return array<string, mixed>
     */
    private function userPayload(User $user): array
    {
        return $user->only([
            'id',
            'subject_id',
            'email',
            'display_name',
            'role',
            'last_login_at',
            'created_at',
        ]);
    }
}
