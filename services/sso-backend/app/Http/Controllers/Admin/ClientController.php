<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\SyncClientScopesAction;
use App\Actions\Admin\UpdateManagedClientAction;
use App\Http\Requests\Admin\SyncClientScopesRequest;
use App\Http\Requests\Admin\UpdateManagedClientRequest;
use App\Models\OidcClientRegistration;
use App\Services\Admin\AdminClientPresenter;
use App\Services\Admin\AdminClientQuery;
use App\Services\Oidc\ClientIntegrationRegistrationService;
use App\Services\Oidc\ScopePolicy;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ClientController
{
    public function __construct(
        private readonly AdminClientQuery $clients,
        private readonly AdminClientPresenter $presenter,
        private readonly ClientIntegrationController $integrations,
    ) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok(['clients' => $this->clients->clients()]);
    }

    public function show(string $clientId): JsonResponse
    {
        $registration = $this->clients->registration($clientId);

        return $registration instanceof OidcClientRegistration
            ? AdminApiResponse::ok(['client' => $this->presenter->registration($registration)])
            : AdminApiResponse::error('not_found', 'Client not found.', 404);
    }

    public function scopes(ScopePolicy $scopes): JsonResponse
    {
        return AdminApiResponse::ok(['scopes' => $scopes->catalog()]);
    }

    public function syncScopes(SyncClientScopesRequest $request, SyncClientScopesAction $action, string $clientId): JsonResponse
    {
        try {
            $registration = $action->execute($request, $request->attributes->get('admin_user'), $clientId, $request->validated('scopes'));
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return AdminApiResponse::ok(['client' => $this->presenter->registration($registration)]);
    }

    public function update(UpdateManagedClientRequest $request, UpdateManagedClientAction $action, string $clientId): JsonResponse
    {
        try {
            $registration = $action->execute($request, $request->attributes->get('admin_user'), $clientId, $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return AdminApiResponse::ok(['client' => $this->presenter->registration($registration)]);
    }

    public function destroy(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        return $this->integrations->disable($request, $registrations, $clientId);
    }

    private function invalidIntegration(RuntimeException $exception): JsonResponse
    {
        return AdminApiResponse::error('client_integration_invalid', $exception->getMessage(), 422);
    }
}
