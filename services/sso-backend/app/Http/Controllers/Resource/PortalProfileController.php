<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class PortalProfileController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
        private readonly DirectoryUserProvider $directory,
    ) {}

    /**
     * GET /api/profile — session-cookie-based profile for the user portal.
     *
     * Returns ProfilePortal contract expected by the frontend.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $currentSession = $this->resolveCurrentSession($request);
        if (! $currentSession) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = User::find($currentSession->user_id);
        if (! $user) {
            return response()->json(['message' => 'Pengguna tidak ditemukan.'], 404);
        }

        $roles = $this->directory->rolesFor($user->subject_id);
        $loginContext = DB::table('login_contexts')->where('subject_id', $user->subject_id)->first();

        return response()->json([
            'profile' => [
                'subject_id' => $user->subject_id,
                'display_name' => $user->display_name,
                'given_name' => $user->given_name,
                'family_name' => $user->family_name,
                'email' => $user->email,
                'email_verified' => $user->email_verified_at !== null,
                'status' => $user->status ?? 'active',
                'profile_synced_at' => $user->profile_synced_at,
                'last_login_at' => $user->last_login_at,
            ],
            'authorization' => [
                'scope' => 'openid profile email',
                'roles' => $roles,
                'permissions' => [],
            ],
            'security' => [
                'session_id' => $currentSession->session_id,
                'risk_score' => (int) ($loginContext->risk_score ?? 0),
                'mfa_required' => (bool) ($loginContext->mfa_required ?? false),
                'last_seen_at' => $currentSession->last_seen_at?->toIso8601String(),
            ],
        ]);
    }

    private function resolveCurrentSession(Request $request): ?SsoSession
    {
        $sessionId = $this->cookies->resolve($request);

        return $this->sessionService->current($sessionId);
    }
}
