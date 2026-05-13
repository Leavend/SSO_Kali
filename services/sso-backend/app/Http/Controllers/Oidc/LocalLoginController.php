<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\AuthenticateLocalCredentials;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * FR-014: Local password login endpoint.
 *
 * POST /connect/local-login
 */
final class LocalLoginController
{
    public function __invoke(Request $request, AuthenticateLocalCredentials $action): JsonResponse
    {
        return $action->handle($request);
    }
}
