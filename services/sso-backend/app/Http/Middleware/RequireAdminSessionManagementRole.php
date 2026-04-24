<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminPermissionMatrix;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequireAdminSessionManagementRole
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
        private readonly AdminPermissionMatrix $permissions,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $admin = $request->attributes->get('admin_user');

        if (! $admin instanceof User) {
            return $this->unauthorized($request);
        }

        if (! $this->permissions->canManageSessions($admin)) {
            return $this->forbidden($request, $admin);
        }

        return $next($request);
    }

    private function unauthorized(Request $request): Response
    {
        $this->audit->denied('session_management', $request, null, 'missing_admin_context');

        return response()->json([
            'error' => 'unauthorized',
            'error_description' => 'Admin context is missing.',
        ], 401);
    }

    private function forbidden(Request $request, User $admin): Response
    {
        $this->audit->denied('session_management', $request, $admin, 'explicit_role_required', [
            'allowed_roles' => $this->sessionManagementRoles(),
        ], AdminAuditTaxonomy::FORBIDDEN);

        return response()->json([
            'error' => 'forbidden',
            'error_description' => 'Explicit session management role is required.',
        ], 403);
    }

    /**
     * @return list<string>
     */
    private function sessionManagementRoles(): array
    {
        $roles = config('sso.admin.session_management_roles', ['admin']);

        return is_array($roles) ? array_values(array_filter($roles, 'is_string')) : ['admin'];
    }
}
