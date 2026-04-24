<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\HandleAdminPanelBackChannelLogout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AdminPanelBackChannelLogoutController
{
    public function __invoke(Request $request, HandleAdminPanelBackChannelLogout $action): JsonResponse
    {
        return $action->handle($request);
    }
}
