<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\InspectSsoSessionAction;
use App\Services\Session\SsoSessionCookieResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionController
{
    public function __invoke(
        Request $request,
        SsoSessionCookieResolver $cookies,
        InspectSsoSessionAction $inspect,
    ): JsonResponse {
        $result = $inspect->execute($cookies->resolve($request));

        if (! $result->authenticated) {
            return response()->json(['authenticated' => false], 401);
        }

        return response()->json([
            'authenticated' => true,
            'user' => $result->user,
        ]);
    }
}
