<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\PerformSingleSignOut;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionLogoutController
{
    public function __invoke(Request $request, PerformSingleSignOut $action): JsonResponse
    {
        return $action->handle($request);
    }
}
