<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\HandleUpstreamCallback;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class UpstreamCallbackController
{
    public function __invoke(
        Request $request,
        HandleUpstreamCallback $action,
    ): JsonResponse|RedirectResponse {
        return $action->handle($request);
    }
}
