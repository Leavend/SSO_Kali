<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\PerformFrontChannelLogout;
use App\Actions\Oidc\PerformSingleSignOut;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class SessionLogoutController
{
    public function __invoke(
        Request $request,
        PerformSingleSignOut $singleSignOut,
        PerformFrontChannelLogout $frontChannelLogout,
    ): Response {
        return $request->isMethod('post') || $request->bearerToken() !== null
            ? $singleSignOut->handle($request)
            : $frontChannelLogout->handle($request);
    }
}
