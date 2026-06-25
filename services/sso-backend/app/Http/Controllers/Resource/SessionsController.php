<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Models\SsoSession;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionsController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $currentSession = $this->resolveCurrentSession($request);
        if (! $currentSession) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $sessions = SsoSession::where('user_id', $currentSession->user_id)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('authenticated_at')
            ->get()
            ->map(fn (SsoSession $s) => [
                'session_id' => $s->session_id,
                'opened_at' => $s->authenticated_at->toIso8601String(),
                'last_used_at' => $s->last_seen_at?->toIso8601String() ?? $s->authenticated_at->toIso8601String(),
                'expires_at' => $s->expires_at->toIso8601String(),
                'client_count' => 0,
                'client_ids' => [],
                'client_display_names' => [],
                'user_agent' => $s->user_agent,
                'ip_address' => $s->ip_address,
                'is_current' => $s->session_id === $currentSession->session_id,
            ]);

        return response()->json(['sessions' => $sessions]);
    }

    /**
     * DELETE /api/profile/sessions/{sessionId} — revoke a single session.
     */
    public function destroy(Request $request, string $sessionId): JsonResponse
    {
        $currentSession = $this->resolveCurrentSession($request);
        if (! $currentSession) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $session = SsoSession::where('user_id', $currentSession->user_id)
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->first();

        if (! $session) {
            return response()->json(['message' => 'Sesi tidak ditemukan.'], 404);
        }

        $this->sessionService->revoke($session);

        return response()->json([
            'session_id' => $sessionId,
            'revoked' => true,
            'revoked_refresh_tokens' => 0,
        ]);
    }

    /**
     * DELETE /api/profile/sessions — revoke all sessions except current.
     */
    public function destroyAll(Request $request): JsonResponse
    {
        $currentSession = $this->resolveCurrentSession($request);
        if (! $currentSession) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $sessions = SsoSession::where('user_id', $currentSession->user_id)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->where('session_id', '!=', $currentSession->session_id)
            ->get();

        $sessions->each(function (SsoSession $session): void {
            $this->sessionService->revoke($session);
        });

        return response()->json([
            'revoked' => true,
            'revoked_sessions' => $sessions->count(),
            'revoked_refresh_tokens' => 0,
        ]);
    }

    private function resolveCurrentSession(Request $request): ?SsoSession
    {
        $sessionId = $this->cookies->resolve($request);

        return $this->sessionService->current($sessionId);
    }
}
