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

final class RequireAdminPermission
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
        private readonly AdminPermissionMatrix $permissions,
    ) {}

    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $admin = $request->attributes->get('admin_user');

        if (! $admin instanceof User) {
            return $this->unauthorized($request, $permission);
        }

        if (! $this->permissions->allows($admin, $permission)) {
            return $this->forbidden($request, $admin, $permission);
        }

        return $next($request);
    }

    private function unauthorized(Request $request, string $permission): Response
    {
        $this->audit->denied('rbac_permission', $request, null, 'missing_admin_context', [
            'permission' => $permission,
        ]);

        return response()->json([
            'error' => 'unauthorized',
            'error_description' => 'Admin context is missing.',
        ], 401);
    }

    private function forbidden(Request $request, User $admin, string $permission): Response
    {
        $this->audit->denied('rbac_permission', $request, $admin, 'permission_required', [
            'permission' => $permission,
        ], AdminAuditTaxonomy::FORBIDDEN);

        return response()->json([
            'error' => 'forbidden',
            'error_description' => 'Required admin permission is missing.',
        ], 403);
    }
}
