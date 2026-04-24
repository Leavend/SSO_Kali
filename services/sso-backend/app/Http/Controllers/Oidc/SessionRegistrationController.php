<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\RegisterClientSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionRegistrationController
{
    public function __invoke(Request $request, RegisterClientSession $action): JsonResponse
    {
        return $action->handle($request);
    }
}
