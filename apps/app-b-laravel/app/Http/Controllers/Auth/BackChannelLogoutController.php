<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\HandleBackChannelLogout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BackChannelLogoutController
{
    public function __invoke(Request $request, HandleBackChannelLogout $action): JsonResponse
    {
        return $action->handle($request);
    }
}
