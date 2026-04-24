<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\HandleBrokerCallback;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class BrokerCallbackController
{
    public function __invoke(
        Request $request,
        HandleBrokerCallback $action,
    ): JsonResponse|RedirectResponse {
        return $action->handle($request);
    }
}
