<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Oidc\OidcFoundationSnapshotBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class OidcFoundationController
{
    public function __construct(private readonly OidcFoundationSnapshotBuilder $snapshotBuilder) {}

    public function __invoke(Request $request): JsonResponse
    {
        return response()->json(
            $this->snapshotBuilder->build($request->headers->get('X-Request-Id')),
        )
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }
}
