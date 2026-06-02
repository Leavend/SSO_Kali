<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\CompleteSsoAuthorization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SsoCompleteController
{
    public function __invoke(Request $request, CompleteSsoAuthorization $action): JsonResponse
    {
        return $action->handle($request);
    }
}
