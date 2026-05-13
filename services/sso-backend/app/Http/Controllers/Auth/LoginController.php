<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginSsoUserAction;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\MfaCredential;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\JsonResponse;

final class LoginController
{
    public function __invoke(
        LoginRequest $request,
        LoginSsoUserAction $login,
        SsoSessionCookieFactory $cookies,
        MfaChallengeStore $challenges,
    ): JsonResponse {
        $result = $login->execute(
            (string) $request->validated('identifier'),
            (string) $request->validated('password'),
            $request->ip(),
            $request->userAgent(),
            $this->optionalString($request->validated('auth_request_id')),
            $request->headers->get('X-Request-Id'),
        );

        if (! $result->authenticated || $result->user === null || $result->session === null) {
            return response()->json([
                'authenticated' => false,
                'error' => $result->error,
                'message' => 'The supplied credentials are invalid.',
            ], 401);
        }

        // FR-018: Check if user has MFA enrolled — require challenge
        if ($this->requiresMfaChallenge($result->user->id)) {
            // Revoke the pre-created session (will be re-created after MFA)
            $result->session->update(['revoked_at' => now()]);

            $challenge = $challenges->create($result->user->id);

            return response()->json([
                'authenticated' => false,
                'mfa_required' => true,
                'challenge' => [
                    'challenge_id' => $challenge['challenge_id'],
                    'methods_available' => ['totp', 'recovery_code'],
                    'expires_at' => $challenge['expires_at'],
                ],
            ]);
        }

        return response()->json([
            'authenticated' => true,
            'user' => $result->user->toArray(),
            'session' => ['expires_at' => $result->session->expires_at->toIso8601String()],
            'next' => [
                'type' => $request->validated('auth_request_id') !== null ? 'continue_authorize' : 'session',
                'auth_request_id' => $request->validated('auth_request_id'),
            ],
        ])->withCookie($cookies->make($result->session->session_id));
    }

    private function requiresMfaChallenge(int $userId): bool
    {
        return MfaCredential::query()
            ->forUser($userId)
            ->totp()
            ->verified()
            ->exists();
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
