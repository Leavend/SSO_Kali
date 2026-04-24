<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\CreateAuthorizationRedirect;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

final class AuthorizeController
{
    public function __invoke(
        Request $request,
        CreateAuthorizationRedirect $action,
    ): JsonResponse|RedirectResponse {
        return $action->handle($request);
    }
}
