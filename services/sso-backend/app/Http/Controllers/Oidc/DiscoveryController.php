<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Services\Oidc\PrototypeOidcCatalog;
use Illuminate\Http\JsonResponse;

final class DiscoveryController
{
    public function __invoke(PrototypeOidcCatalog $catalog): JsonResponse
    {
        return response()->json($catalog->discovery());
    }
}
