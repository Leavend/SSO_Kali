<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminMfaPolicy;
use App\Services\Admin\AdminPermissionMatrix;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PrincipalController
{
    public function __construct(
        private readonly AdminPermissionMatrix $permissions,
        private readonly AdminMfaPolicy $mfa,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $admin = $request->attributes->get('admin_user');
        $context = $request->attributes->get('admin_auth_context');

        if (! $admin instanceof User) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $this->audit->succeeded('admin_api', $request, $admin, [
            'freshness_level' => 'read',
            'auth_time' => $context['auth_time'] ?? null,
        ], AdminAuditTaxonomy::FRESH_AUTH_SUCCESS);

        return response()->json(['principal' => $this->payload($admin, is_array($context) ? $context : [])]);
    }

    /**
     * @param  array<string, mixed>  $authContext
     * @return array<string, mixed>
     */
    private function payload(User $user, array $authContext): array
    {
        return [
            ...$user->only(['subject_id', 'email', 'display_name', 'role', 'last_login_at']),
            'auth_context' => [
                'auth_time' => $authContext['auth_time'] ?? null,
                'amr' => $authContext['amr'] ?? [],
                'acr' => $authContext['acr'] ?? null,
                'mfa_enforced' => $this->mfa->enabled(),
                'mfa_verified' => $this->mfa->verified($authContext),
            ],
            'permissions' => $this->permissions->for($user),
        ];
    }
}
