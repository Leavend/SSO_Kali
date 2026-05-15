<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mfa;

use App\Actions\Mfa\PersistMfaAuthContext;
use App\Actions\Mfa\VerifyMfaChallenge;
use App\Actions\Oidc\CompletePendingOidcAuthorization;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * FR-018 / UC-67 / BE-FR019-001: MFA challenge verification during login.
 *
 * On success, creates the SSO session, persists the MFA-upgraded auth
 * context, and — when the challenge was started from an OIDC authorize
 * request — finalizes the pending authorization server-side and returns
 * the redirect URI (with code or consent state). The client never sees
 * the redemption parameters.
 *
 * POST /api/mfa/challenge/verify
 */
final class MfaChallengeController
{
    public function __invoke(
        Request $request,
        VerifyMfaChallenge $action,
        PersistMfaAuthContext $persistContext,
        MfaChallengeStore $challenges,
        CompletePendingOidcAuthorization $completePending,
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

        // BE-FR019-001: capture the bound OIDC context BEFORE the action
        // consumes the challenge. The store deletes the challenge on success.
        $pendingContext = $challenges->pendingOidcContext($challengeId);

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

        $payload = [
            'authenticated' => true,
            'mfa_method' => $method,
            'user' => [
                'subject_id' => $user->subject_id,
                'email' => $user->email,
                'display_name' => $user->display_name,
            ],
            'session' => ['expires_at' => $session->expires_at->toIso8601String()],
        ];

        // BE-FR019-001: when a pending OIDC authorize request is bound to
        // this challenge, finalize it now and return the redirect URI.
        if ($pendingContext !== null) {
            $continuation = $completePending->execute(
                user: $user,
                context: $pendingContext,
                sessionId: $session->session_id,
                request: $request,
            );

            if ($continuation === null) {
                return response()->json([
                    'authenticated' => false,
                    'error' => 'The pending authorization request is no longer valid.',
                ], 409);
            }

            $payload['continuation'] = [
                'type' => $continuation['requires_consent'] ? 'consent' : 'authorization_code',
                'redirect_uri' => $continuation['redirect_uri'],
            ];
            // Backwards-compatible top-level field for legacy callers.
            $payload['redirect_uri'] = $continuation['redirect_uri'];
        }

        return response()->json($payload)->withCookie($cookies->make($session->session_id));
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
