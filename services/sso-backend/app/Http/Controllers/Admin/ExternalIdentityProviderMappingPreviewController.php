<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpClaimsMapperPreviewService;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * FR-058 / BE-FR058-001 — admin mapping preview endpoint.
 *
 * Delegates to {@see ExternalIdpClaimsMapperPreviewService} so the controller
 * stays under the 100-line production guardrail.
 */
final class ExternalIdentityProviderMappingPreviewController
{
    public function __construct(private readonly ExternalIdpClaimsMapperPreviewService $previews) {}

    public function __invoke(Request $request, string $providerKey): JsonResponse
    {
        $provider = ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();

        if (! $provider instanceof ExternalIdentityProvider) {
            return AdminApiResponse::error('not_found', 'External IdP not found.', 404);
        }

        $validator = Validator::make($request->input(), ['claims' => ['required', 'array']]);

        if ($validator->fails()) {
            return AdminApiResponse::error('invalid_payload', 'Sample claims payload is required.', 422, [
                'errors' => $validator->errors()->toArray(),
            ]);
        }

        /** @var array<string, mixed> $claims */
        $claims = $validator->validated()['claims'];

        return AdminApiResponse::ok(['preview' => $this->previews->preview($provider, $claims)]);
    }
}
