<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Actions\Mfa\PersistMfaAuthContext;
use App\Actions\Mfa\VerifyMfaChallenge;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * FR-018 / UC-67: MFA challenge verification during login.
 *
 * POST /api/mfa/challenge/verify
 */
final class MfaChallengeController
{
    public function __invoke(
        Request $request,
        VerifyMfaChallenge $action,
        PersistMfaAuthContext $persistContext,
        SsoSessionCookieFactory $cookies,
    ): JsonResponse {
        $request->validate([
            'challenge_id' => ['required', 'string'],
            'method' => ['required', 'string', 'in:totp,recovery_code'],
            'code' => ['required', 'string'],
        ]);

        $challengeId = (string) $request->input('challenge_id');
        $method = (string) $request->input('method');
        $code = (string) $request->input('code');

        // Resolve user before verification (challenge is consumed on success)
        $userId = $action->userIdFromChallenge($challengeId);

        if ($userId === null) {
            return response()->json([
                'authenticated' => false,
                'error' => 'Challenge expired or not found.',
            ], 422);
        }

        try {
            $action->execute($challengeId, $method, $code);
        } catch (RuntimeException $e) {
            return response()->json([
                'authenticated' => false,
                'error' => $e->getMessage(),
            ], 422);
        }

        $user = User::query()->find($userId);

        if (! $user instanceof User) {
            return response()->json([
                'authenticated' => false,
                'error' => 'User not found.',
            ], 422);
        }

        // Create SSO session with MFA-verified amr
        $session = $this->createSession($user, $request);

        // FR-019 / ISSUE-04+06: Persist MFA auth context for token claims
        $persistContext->execute(
            subjectId: $user->subject_id,
            ipAddress: (string) $request->ip(),
        );

        return response()->json([
            'authenticated' => true,
            'mfa_method' => $method,
            'user' => [
                'subject_id' => $user->subject_id,
                'email' => $user->email,
                'display_name' => $user->display_name,
            ],
            'session' => ['expires_at' => $session->expires_at->toIso8601String()],
        ])->withCookie($cookies->make($session->session_id));
    }

    private function createSession(User $user, Request $request): SsoSession
    {
        $now = now();

        return SsoSession::query()->create([
            'session_id' => (string) Str::uuid(),
            'user_id' => $user->getKey(),
            'subject_id' => $user->subject_id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'authenticated_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $now->copy()->addMinutes((int) config('sso.session.ttl_minutes', 480)),
        ]);
    }
}
