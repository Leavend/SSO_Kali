<?php

declare(strict_types=1);

namespace App\Http\Responses\Oidc;

use App\Services\Oidc\OidcCatalog;
use Illuminate\Http\JsonResponse;

final class PublicMetadataResponseFactory
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function json(array $payload, OidcCatalog $catalog): JsonResponse
    {
        return response()
            ->json($payload)
            ->header('Cache-Control', $this->cacheControl($catalog));
    }

    private function cacheControl(OidcCatalog $catalog): string
    {
        return sprintf(
            'public, max-age=%d, stale-while-revalidate=%d',
            $catalog->cacheTtlSeconds(),
            $catalog->staleWhileRevalidateSeconds(),
        );
    }
}
