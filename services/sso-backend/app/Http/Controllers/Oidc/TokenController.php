<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\ExchangeToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TokenController
{
    public function __invoke(Request $request, ExchangeToken $action): JsonResponse
    {
        return $action->handle($request);
    }
}
