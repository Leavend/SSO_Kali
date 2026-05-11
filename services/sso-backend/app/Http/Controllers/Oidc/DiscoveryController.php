<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Http\Responses\Oidc\PublicMetadataResponseFactory;
use App\Services\Oidc\OidcCatalog;
use Illuminate\Http\JsonResponse;

final class DiscoveryController
{
    public function __invoke(OidcCatalog $catalog, PublicMetadataResponseFactory $responses): JsonResponse
    {
        return $responses->json($catalog->discovery(), $catalog);
    }
}
