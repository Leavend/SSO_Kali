<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\RenderFrontChannelLogoutFallback;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * BE-FR043-001 — Front-Channel Logout fallback endpoint.
 *
 * Reachable at GET /connect/logout/frontchannel and authorised by the
 * same SSO bearer token used during global logout. Returns a minimal
 * HTML page that loads each registered RP's `frontchannel_logout_uri`
 * inside a hidden iframe, satisfying OIDC Front-Channel Logout 1.0 §3.
 */
final class FrontChannelLogoutFallbackController
{
    public function __invoke(
        Request $request,
        RenderFrontChannelLogoutFallback $action,
    ): Response {
        return $action->handle($request);
    }
}
