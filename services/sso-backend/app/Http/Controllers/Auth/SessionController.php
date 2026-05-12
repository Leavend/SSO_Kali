<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\InspectSsoSessionAction;
use App\Models\SsoSession;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionController
{
    public function __invoke(
        Request $request,
        SsoSessionCookieResolver $cookies,
        SsoSessionCookieFactory $cookieFactory,
        InspectSsoSessionAction $inspect,
    ): JsonResponse {
        $sessionId = $cookies->resolve($request);
        $result = $inspect->execute($sessionId);

        if (! $result->authenticated) {
            return response()->json(['authenticated' => false], 401);
        }

        // FR-039 / UC-49: Sliding window — extend session TTL on heartbeat.
        $response = response()->json([
            'authenticated' => true,
            'user' => $result->user,
        ]);

        if (is_string($sessionId) && $sessionId !== '') {
            // Extend DB session expiry
            SsoSession::where('session_id', $sessionId)
                ->whereNull('revoked_at')
                ->update([
                    'expires_at' => now()->addMinutes((int) config('sso.session.ttl_minutes', 480)),
                    'last_seen_at' => now(),
                ]);

            // Refresh cookie TTL
            $response->withCookie($cookieFactory->make($sessionId));
        }

        return $response;
    }
}
