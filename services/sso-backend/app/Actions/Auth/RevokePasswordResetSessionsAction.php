<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Support\Facades\DB;

final class RevokePasswordResetSessionsAction
{
    public function __construct(
        private readonly RefreshTokenStore $refreshTokens,
        private readonly AccessTokenRevocationStore $accessTokens,
    ) {}

    public function execute(User $user): void
    {
        $this->refreshTokens->revokeSubject($user->subject_id);
        foreach ($this->sessionIds($user->subject_id) as $sessionId) {
            $this->accessTokens->revokeSession($sessionId);
        }

        DB::table('sso_sessions')
            ->where('subject_id', $user->subject_id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * @return list<string>
     */
    private function sessionIds(string $subjectId): array
    {
        return DB::table('sso_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->pluck('session_id')
            ->merge(DB::table('refresh_token_rotations')->where('subject_id', $subjectId)->pluck('session_id'))
            ->filter(fn (mixed $value): bool => is_string($value) && $value !== '')
            ->unique()
            ->values()
            ->all();
    }
}
