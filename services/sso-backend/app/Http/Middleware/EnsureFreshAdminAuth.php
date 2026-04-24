<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminFreshnessPolicy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureFreshAdminAuth
{
    public function __construct(
        private readonly AdminFreshnessPolicy $policy,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function handle(Request $request, Closure $next, string $level = 'read'): Response
    {
        $admin = $request->attributes->get('admin_user');
        $context = $request->attributes->get('admin_auth_context');

        if (! $admin instanceof User || ! is_array($context)) {
            return $this->unauthorized();
        }

        $authTime = is_int($context['auth_time'] ?? null) ? $context['auth_time'] : null;

        if ($this->policy->stale($authTime, $level)) {
            $this->audit->denied($this->action($level), $request, $admin, $this->policy->reason($level), [
                'auth_time' => $authTime,
                'freshness_level' => $level,
                'required_freshness_seconds' => $this->policy->window($level),
            ], AdminAuditTaxonomy::STALE_AUTH_REJECTED);

            return $this->reauthRequired();
        }

        return $next($request);
    }

    private function action(string $level): string
    {
        return $level === 'step_up' ? 'session_management' : 'admin_api';
    }

    private function unauthorized(): Response
    {
        return response()->json([
            'error' => 'unauthorized',
            'error_description' => 'Admin authentication context is missing.',
        ], 401);
    }

    private function reauthRequired(): Response
    {
        return response()->json([
            'error' => 'reauth_required',
            'error_description' => 'Fresh authentication is required for this resource.',
        ], 401);
    }
}
