<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginSsoUserAction;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\MfaCredential;
use App\Models\User;
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
            $payload = [
                'authenticated' => false,
                'error' => $result->error,
                'message' => $this->errorMessage($result->error),
            ];
            $headers = [];

            if ($result->error === 'too_many_attempts' && $result->retryAfter !== null) {
                $payload['retry_after'] = $result->retryAfter;
                $headers['Retry-After'] = (string) $result->retryAfter;
            }

            return response()->json($payload, $this->errorStatus($result->error), $headers);
        }

        // BE-FR020-001 — lost-factor recovery: a user with `mfa_reset_required`
        // must enrol a fresh second factor before any privileged login
        // succeeds. Revoke the pre-created session and surface a structured
        // 403 so the SPA can show the re-enrolment prompt.
        $resolvedUser = User::query()->where('subject_id', $result->user->subjectId)->first();
        if ($resolvedUser instanceof User && $resolvedUser->mfa_reset_required) {
            $result->session->update(['revoked_at' => now()]);

            return response()->json([
                'authenticated' => false,
                'error' => 'mfa_reenrollment_required',
                'message' => 'Akun Anda telah direset oleh admin. Aktifkan kembali autentikasi multi-faktor (MFA) sebelum melanjutkan.',
                'mfa_reset_at' => $resolvedUser->mfa_reset_at?->toIso8601String(),
            ], 403);
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

    private function errorMessage(?string $error): string
    {
        return match ($error) {
            'account_locked' => 'Akun Anda telah dikunci. Hubungi administrator.',
            'password_expired' => 'Password Anda telah kedaluwarsa. Silakan ubah password.',
            'too_many_attempts' => 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
            default => 'The supplied credentials are invalid.',
        };
    }

    private function errorStatus(?string $error): int
    {
        return match ($error) {
            'password_expired' => 403,
            'too_many_attempts' => 429,
            default => 401,
        };
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
