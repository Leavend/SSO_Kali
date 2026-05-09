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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ExternalIdentityProviderController
{
    public function __construct(
        private readonly ExternalIdentityProviderRegistry $registry,
    ) {}

    public function index(Request $request, ListExternalIdentityProvidersAction $action): JsonResponse
    {
        $providers = $action->execute((int) $request->integer('per_page', 25));

        return response()->json([
            'providers' => array_map($this->payload(...), $providers->items()),
            'meta' => [
                'current_page' => $providers->currentPage(),
                'per_page' => $providers->perPage(),
                'total' => $providers->total(),
            ],
        ]);
    }

    public function show(string $providerKey): JsonResponse
    {
        $provider = $this->find($providerKey);

        if (! $provider instanceof ExternalIdentityProvider) {
            return response()->json(['error' => 'External IdP not found.'], 404);
        }

        return response()->json(['provider' => $this->payload($provider)]);
    }

    public function store(
        StoreExternalIdentityProviderRequest $request,
        StoreExternalIdentityProviderAction $action,
    ): JsonResponse {
        try {
            $provider = $action->execute($request, $this->admin($request), $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return response()->json(['provider' => $this->payload($provider)], 201);
    }

    public function update(
        UpdateExternalIdentityProviderRequest $request,
        UpdateExternalIdentityProviderAction $action,
        string $providerKey,
    ): JsonResponse {
        try {
            $provider = $action->execute($request, $this->admin($request), $providerKey, $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return response()->json(['provider' => $this->payload($provider)]);
    }

    public function destroy(
        Request $request,
        DeleteExternalIdentityProviderAction $action,
        string $providerKey,
    ): JsonResponse {
        try {
            $action->execute($request, $this->admin($request), $providerKey);
        } catch (RuntimeException $exception) {
            return $this->invalidIdp($exception);
        }

        return response()->json(status: 204);
    }

    private function find(string $providerKey): ?ExternalIdentityProvider
    {
        return ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();
    }

    /**
     * @return array<string, mixed>
     */
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
        return response()->json([
            'error' => 'external_idp_invalid',
            'message' => $exception->getMessage(),
        ], 422);
    }
}
