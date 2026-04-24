<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Actions\Oidc\BuildResourceProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ProfileController
{
    public function __invoke(Request $request, BuildResourceProfile $action): JsonResponse
    {
        return $action->handle($request);
    }
}
