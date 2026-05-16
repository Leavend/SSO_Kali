<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\ProposeSecurityPolicyRequest;
use App\Http\Requests\Admin\TransitionSecurityPolicyRequest;
use App\Models\User;
use App\Services\Security\SecurityPolicyService;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * FR-055 / BE-FR055-001 — admin endpoints for the security policy aggregate.
 *
 * Routes mounted under `admin.api.*` and gated by the
 * `admin.security-policy.read|write|activate` permissions plus the standard
 * fresh-auth + MFA assurance middleware stack.
 */
final class SecurityPolicyController
{
    public function __construct(private readonly SecurityPolicyService $service) {}

    public function index(Request $request, string $category): JsonResponse
    {
        try {
            $policies = $this->service->listForCategory($category);
        } catch (InvalidArgumentException $exception) {
            return AdminApiResponse::error('invalid_category', $exception->getMessage(), 422);
        }

        return AdminApiResponse::ok([
            'category' => $category,
            'active' => $this->service->active($category),
            'policies' => $policies,
        ]);
    }

    public function store(ProposeSecurityPolicyRequest $request, string $category): JsonResponse
    {
        try {
            $policy = $this->service->propose(
                $request,
                $this->admin($request)->subject_id,
                $category,
                $request->validated('payload', []),
                $request->validated('reason'),
            );
        } catch (InvalidArgumentException $exception) {
            return AdminApiResponse::error('invalid_category', $exception->getMessage(), 422);
        }

        return AdminApiResponse::created(['policy' => $policy]);
    }

    public function activate(TransitionSecurityPolicyRequest $request, string $category, int $version): JsonResponse
    {
        $effectiveAt = $request->validated('effective_at');
        $effective = is_string($effectiveAt) && trim($effectiveAt) !== '' ? Carbon::parse($effectiveAt) : null;

        try {
            $policy = $this->service->activate($request, $this->admin($request)->subject_id, $category, $version, $request->validated('reason'), $effective);
        } catch (InvalidArgumentException $exception) {
            return AdminApiResponse::error('security_policy_invalid', $exception->getMessage(), 422);
        }

        return AdminApiResponse::ok(['policy' => $policy]);
    }

    public function rollback(TransitionSecurityPolicyRequest $request, string $category, int $version): JsonResponse
    {
        try {
            $policy = $this->service->rollback($request, $this->admin($request)->subject_id, $category, $version, $request->validated('reason'));
        } catch (InvalidArgumentException $exception) {
            return AdminApiResponse::error('security_policy_invalid', $exception->getMessage(), 422);
        }

        return AdminApiResponse::ok(['policy' => $policy]);
    }

    private function admin(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        return $admin;
    }
}
