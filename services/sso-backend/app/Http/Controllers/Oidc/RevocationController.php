<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\RevokeToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RevocationController
{
    public function __invoke(Request $request, RevokeToken $action): JsonResponse
    {
        return $action->handle($request);
    }
}
