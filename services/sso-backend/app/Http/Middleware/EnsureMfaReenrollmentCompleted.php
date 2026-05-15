<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * BE-FR020-001 — Lost-factor MFA recovery.
 *
 * Once an admin has performed an emergency MFA reset, every protected
 * endpoint MUST refuse to serve the user until they have completed a fresh
 * second-factor enrolment. The MFA enrolment endpoints themselves are the
 * only allow-list (otherwise the user would be locked out forever).
 *
 * Returns:
 *   - 403 mfa_reenrollment_required + a localizable hint when the flag is
 *     set on the resolved user.
 *
 * The middleware is placed AFTER `ResolveSsoSessionUser` so the user is
 * already attached to the request.
 */
final class EnsureMfaReenrollmentCompleted
{
    /**
     * Routes that must remain reachable so the user can complete enrolment
     * and inspect their own state. Anything else is gated.
     *
     * @var list<string>
     */
    private const ALLOWED_PATHS = [
        'api/mfa/status',
        'api/mfa/totp/enroll',
        'api/mfa/totp/verify',
        'api/auth/session',
        'api/auth/logout',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || ! $user->mfa_reset_required) {
            return $next($request);
        }

        if ($this->isAllowed($request)) {
            return $next($request);
        }

        return response()->json([
            'error' => 'mfa_reenrollment_required',
            'message' => 'Akun Anda telah direset oleh admin. Aktifkan kembali autentikasi multi-faktor (MFA) sebelum melanjutkan.',
            'mfa_reset_at' => $user->mfa_reset_at?->toIso8601String(),
        ], 403);
    }

    private function isAllowed(Request $request): bool
    {
        $path = trim($request->path(), '/');

        foreach (self::ALLOWED_PATHS as $allowed) {
            if ($path === $allowed) {
                return true;
            }
        }

        return false;
    }
}
