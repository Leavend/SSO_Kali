<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminMfaPolicy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureAdminMfaAssurance
{
    public function __construct(
        private readonly AdminMfaPolicy $policy,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->policy->enabled()) {
            return $next($request);
        }

        $admin = $request->attributes->get('admin_user');
        $context = $request->attributes->get('admin_auth_context');

        if (! $admin instanceof User || ! is_array($context)) {
            return $this->unauthorized();
        }

        if (! $this->policy->required($context)) {
            return $next($request);
        }

        $this->audit->denied($this->action($request), $request, $admin, 'mfa_required', [
            'accepted_amr' => $this->policy->acceptedAmr(),
            'amr' => is_array($context['amr'] ?? null) ? $context['amr'] : [],
        ], AdminAuditTaxonomy::MFA_REQUIRED);

        return $this->mfaRequired();
    }

    private function action(Request $request): string
    {
        return $request->isMethod('DELETE') ? 'session_management' : 'admin_api';
    }

    private function unauthorized(): Response
    {
        return response()->json([
            'error' => 'unauthorized',
            'error_description' => 'Admin authentication context is missing.',
        ], 401);
    }

    private function mfaRequired(): Response
    {
        return response()->json([
            'error' => 'mfa_required',
            'error_description' => 'An additional verification factor is required for this resource.',
        ], 403);
    }
}
