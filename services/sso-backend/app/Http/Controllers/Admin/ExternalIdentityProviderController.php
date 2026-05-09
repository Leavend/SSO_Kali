<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\ExternalIdp\DeleteExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\ListExternalIdentityProvidersAction;
use App\Actions\Admin\ExternalIdp\StoreExternalIdentityProviderAction;
use App\Actions\Admin\ExternalIdp\UpdateExternalIdentityProviderAction;
use App\Http\Requests\Admin\StoreExternalIdentityProviderRequest;
use App\Http\Requests\Admin\UpdateExternalIdentityProviderRequest;
use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ExternalIdentityProviderController
{
    public function __construct(private readonly ExternalIdentityProviderRegistry $registry) {}

    public function index(Request $request, ListExternalIdentityProvidersAction $action): JsonResponse
    {
        $providers = $action->execute((int) $request->integer('per_page', 25));

        return AdminApiResponse::ok([
            'providers' => array_map($this->payload(...), $providers->items()),
            'meta' => ['current_page' => $providers->currentPage(), 'per_page' => $providers->perPage(), 'total' => $providers->total()],
        ]);
    }

    public function show(string $providerKey): JsonResponse
    {
        $provider = $this->find($providerKey);

        return $provider instanceof ExternalIdentityProvider
            ? AdminApiResponse::ok(['provider' => $this->payload($provider)])
            : AdminApiResponse::error('not_found', 'External IdP not found.', 404);
    }

    public function store(StoreExternalIdentityProviderRequest $request, StoreExternalIdentityProviderAction $action): JsonResponse
    {
        try {
            $provider = $action->execute($request, $this->admin($request), $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return AdminApiResponse::created(['provider' => $this->payload($provider)]);
    }

    public function update(UpdateExternalIdentityProviderRequest $request, UpdateExternalIdentityProviderAction $action, string $providerKey): JsonResponse
    {
        try {
            $provider = $action->execute($request, $this->admin($request), $providerKey, $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return AdminApiResponse::ok(['provider' => $this->payload($provider)]);
    }

    public function destroy(Request $request, DeleteExternalIdentityProviderAction $action, string $providerKey): JsonResponse
    {
        try {
            $action->execute($request, $this->admin($request), $providerKey);
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return AdminApiResponse::noContent();
    }

    private function find(string $providerKey): ?ExternalIdentityProvider
    {
        return ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();
    }

    /** @return array<string, mixed> */
    private function payload(ExternalIdentityProvider $provider): array
    {
        return $this->registry->publicView($provider);
    }

    private function admin(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        return $admin;
    }

    private function invalidIdp(RuntimeException $exception): JsonResponse
    {
        return AdminApiResponse::error('external_idp_invalid', $exception->getMessage(), 422);
    }
}
