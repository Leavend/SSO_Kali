<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\MfaCredential;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * FR-018 / UC-73: Ensure admin has enrolled MFA.
 *
 * Blocks admin panel access if the admin has not enrolled MFA,
 * unless within the grace period after deployment.
 */
final class EnsureAdminMfaEnrolled
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->enforcementEnabled()) {
            return $next($request);
        }

        $admin = $request->attributes->get('admin_user');

        if (! $admin instanceof User) {
            return $next($request);
        }

        if ($this->hasVerifiedMfa($admin)) {
            return $next($request);
        }

        if ($this->withinGracePeriod($admin)) {
            return $next($request);
        }

        return response()->json([
            'error' => 'mfa_enrollment_required',
            'error_description' => 'You must enroll a multi-factor authentication method before accessing the admin panel.',
        ], 403);
    }

    private function enforcementEnabled(): bool
    {
        return (bool) config('sso.admin.mfa.enforced', false);
    }

    private function hasVerifiedMfa(User $user): bool
    {
        return MfaCredential::query()
            ->forUser($user->getKey())
            ->verified()
            ->exists();
    }

    private function withinGracePeriod(User $user): bool
    {
        if ($this->isProduction()) {
            // BE-FR018-001: enforce grace period = 0 in production regardless of
            // misconfigured env. Production admins MUST enroll MFA before any
            // privileged action.
            return false;
        }

        $graceHours = (int) config('sso.admin.mfa.grace_period_hours', 0);

        if ($graceHours <= 0) {
            return false;
        }

        return $user->created_at->diffInHours(now()) < $graceHours;
    }

    private function isProduction(): bool
    {
        return (string) config('app.env', 'production') === 'production';
    }
}
