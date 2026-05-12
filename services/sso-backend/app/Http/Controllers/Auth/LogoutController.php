<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LogoutSsoSessionAction;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class LogoutController
{
    public function __invoke(
        Request $request,
        LogoutSsoSessionAction $logout,
        SsoSessionCookieResolver $resolver,
        SsoSessionCookieFactory $cookies,
    ): JsonResponse {
        $result = $logout->execute($resolver->resolve($request));

        return response()
            ->json([
                'authenticated' => false,
                'revoked' => $result->revoked,
            ])
            ->withCookie($cookies->forget());
    }
}
