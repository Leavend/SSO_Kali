<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\BuildUserInfo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class UserInfoController
{
    public function __invoke(Request $request, BuildUserInfo $action): JsonResponse
    {
        return $action->handle($request);
    }
}
