<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Actions\Profile\ListConnectedAppsAction;
use App\Actions\Profile\ListUserSessionsAction;
use App\Actions\Profile\RevokeAllUserSessionsAction;
use App\Actions\Profile\RevokeConnectedAppAction;
use App\Actions\Profile\RevokeUserSessionAction;
use App\Actions\Profile\ShowProfilePortalAction;
use App\Actions\Profile\UpdateProfilePortalAction;
use App\Http\Requests\Profile\UpdateProfilePortalRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ProfileController
{
    public function show(Request $request, ShowProfilePortalAction $action): JsonResponse
    {
        return $action->handle($request);
    }

    public function update(UpdateProfilePortalRequest $request, UpdateProfilePortalAction $action): JsonResponse
    {
        return $action->handle($request, $request->validated());
    }

    public function connectedApps(Request $request, ListConnectedAppsAction $action): JsonResponse
    {
        return $action->handle($request);
    }

    public function revokeConnectedApp(Request $request, string $clientId, RevokeConnectedAppAction $action): JsonResponse
    {
        return $action->handle($request, $clientId);
    }

    public function sessions(Request $request, ListUserSessionsAction $action): JsonResponse
    {
        return $action->handle($request);
    }

    public function revokeSession(Request $request, string $sessionId, RevokeUserSessionAction $action): JsonResponse
    {
        return $action->handle($request, $sessionId);
    }

    public function revokeAllSessions(Request $request, RevokeAllUserSessionsAction $action): JsonResponse
    {
        return $action->handle($request);
    }
}
