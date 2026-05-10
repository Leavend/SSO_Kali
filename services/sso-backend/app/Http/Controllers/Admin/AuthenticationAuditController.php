<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\ListAuthenticationAuditEventsRequest;
use App\Services\Admin\AdminAuthenticationAuditPresenter;
use App\Services\Admin\AdminAuthenticationAuditQuery;
use Illuminate\Http\JsonResponse;

final class AuthenticationAuditController
{
    public function index(
        ListAuthenticationAuditEventsRequest $request,
        AdminAuthenticationAuditQuery $query,
        AdminAuthenticationAuditPresenter $presenter,
    ): JsonResponse {
        return response()->json($presenter->collection($query->list($request->validated())));
    }

    public function show(
        string $eventId,
        AdminAuthenticationAuditQuery $query,
        AdminAuthenticationAuditPresenter $presenter,
    ): JsonResponse {
        $event = $query->find($eventId);

        if ($event === null) {
            return response()->json(['error' => 'Authentication audit event not found.'], 404);
        }

        return response()->json(['event' => $presenter->event($event)]);
    }
}
