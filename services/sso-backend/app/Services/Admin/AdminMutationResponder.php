<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Exceptions\RoleManagementException;
use App\Models\User;
use App\Support\Responses\AdminApiResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class AdminMutationResponder
{
    public function __construct(private readonly AdminAuditLogger $audit) {}

    /**
     * @param  array<string, mixed>  $context
     * @param  Closure(): array<string, mixed>  $callback
     */
    public function run(
        Request $request,
        string $action,
        array $context,
        Closure $callback,
        string $failureMessage,
        int $status = 200,
    ): JsonResponse {
        $admin = $this->admin($request);

        try {
            $result = $callback();
        } catch (RoleManagementException $exception) {
            // Surface RoleManagementException with its specific message to the client
            $this->audit->failed(
                $action,
                $request,
                $admin,
                $exception,
                $context,
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );

            return AdminApiResponse::error('role_management_failed', $exception->getMessage(), 422);
        } catch (Throwable $exception) {
            // Generic fallback for other exceptions
            $this->audit->failed(
                $action,
                $request,
                $admin,
                $exception,
                $context,
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );

            return AdminApiResponse::error('admin_action_failed', $failureMessage, 422);
        }

        $this->audit->succeeded(
            $action,
            $request,
            $admin,
            $context,
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return AdminApiResponse::ok($result, $status);
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  Closure(): array<string, mixed>  $callback
     */
    public function runWithAuditResult(
        Request $request,
        string $action,
        array $context,
        Closure $callback,
        string $failureMessage,
    ): JsonResponse {
        $admin = $this->admin($request);

        try {
            $result = $callback();
        } catch (RoleManagementException $exception) {
            // Surface RoleManagementException with its specific message to the client
            $this->audit->failed(
                $action,
                $request,
                $admin,
                $exception,
                [...$context, 'freshness_level' => 'step_up'],
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );

            return AdminApiResponse::error('role_management_failed', $exception->getMessage(), 422);
        } catch (Throwable $exception) {
            // Generic fallback for other exceptions
            $this->audit->failed(
                $action,
                $request,
                $admin,
                $exception,
                [...$context, 'freshness_level' => 'step_up'],
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );

            return AdminApiResponse::error('admin_action_failed', $failureMessage, 500);
        }

        $this->audit->succeeded(
            $action,
            $request,
            $admin,
            [...$context, ...$result, 'freshness_level' => 'step_up'],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return AdminApiResponse::ok($result);
    }

    private function admin(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        return $admin;
    }
}
