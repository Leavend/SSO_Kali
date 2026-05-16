<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\IntrospectToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class IntrospectionController
{
    public function __invoke(Request $request, IntrospectToken $action): JsonResponse
    {
        return $action->handle($request);
    }
}
