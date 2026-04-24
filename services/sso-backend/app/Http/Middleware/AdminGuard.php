<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AuthContextFactory;
use Closure;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * RBAC guard — ensures the authenticated bearer token belongs to a user
 * with the 'admin' role.  Rejects all non-admin requests with HTTP 403.
 */
final class AdminGuard
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly AdminAuditLogger $audit,
        private readonly AuthContextFactory $authContext,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $claims = $this->authenticatedClaims($request);

        if ($claims === null) {
            $this->audit->denied('admin_api', $request, null, 'missing_or_invalid_bearer');

            return $this->unauthorized('Bearer token is missing or invalid.');
        }

        $user = User::query()->where('subject_id', $claims['sub'])->first();

        if (! $user instanceof User || $user->role !== 'admin') {
            $this->audit->denied('admin_api', $request, $user, 'admin_role_required', [
                'token_subject_id' => $claims['sub'] ?? 'unknown',
            ], AdminAuditTaxonomy::FORBIDDEN);

            return $this->forbidden();
        }

        $request->attributes->set('admin_user', $user);
        $request->attributes->set('admin_claims', $claims);
        $request->attributes->set('admin_auth_context', $this->authContext->fromLocalClaims($claims));

        return $next($request);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function authenticatedClaims(Request $request): ?array
    {
        $bearer = $request->bearerToken();

        if (! is_string($bearer) || $bearer === '') {
            return null;
        }

        try {
            return $this->tokens->claimsFrom($bearer);
        } catch (RuntimeException) {
            return null;
        }
    }

    private function unauthorized(string $detail): Response
    {
        return response()->json([
            'error' => 'unauthorized',
            'error_description' => $detail,
        ], 401);
    }

    private function forbidden(): Response
    {
        return response()->json([
            'error' => 'forbidden',
            'error_description' => 'Admin role is required to access this resource.',
        ], 403);
    }
}
