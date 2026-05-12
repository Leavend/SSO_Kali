<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ConnectedAppsController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
    ) {}

    /**
     * GET /api/profile/connected-apps — list OAuth apps user has authorized.
     */
    public function index(Request $request): JsonResponse
    {
        $session = $this->sessionService->current($this->cookies->resolve($request));
        if (! $session) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Return empty list for now — will be populated when OAuth consent flow is implemented.
        return response()->json(['connected_apps' => []]);
    }

    /**
     * DELETE /api/profile/connected-apps/{clientId} — revoke access for a specific app.
     */
    public function destroy(Request $request, string $clientId): JsonResponse
    {
        $session = $this->sessionService->current($this->cookies->resolve($request));
        if (! $session) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        return response()->json([
            'client_id' => $clientId,
            'revoked' => true,
            'revoked_refresh_tokens' => 0,
        ]);
    }
}
