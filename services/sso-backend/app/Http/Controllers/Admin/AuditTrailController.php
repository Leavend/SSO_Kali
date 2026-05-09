<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\ListAuditEventsRequest;
use App\Services\Admin\AdminAuditIntegrityVerifier;
use App\Services\Admin\AdminAuditTrailPresenter;
use App\Services\Admin\AdminAuditTrailQuery;
use Illuminate\Http\JsonResponse;

final class AuditTrailController
{
    public function index(
        ListAuditEventsRequest $request,
        AdminAuditTrailQuery $query,
        AdminAuditTrailPresenter $presenter,
    ): JsonResponse {
        return response()->json($presenter->collection($query->list($request->validated())));
    }

    public function show(
        string $eventId,
        AdminAuditTrailQuery $query,
        AdminAuditTrailPresenter $presenter,
    ): JsonResponse {
        $event = $query->find($eventId);

        if ($event === null) {
            return response()->json(['error' => 'Audit event not found.'], 404);
        }

        return response()->json(['event' => $presenter->event($event)]);
    }

    public function integrity(AdminAuditIntegrityVerifier $verifier): JsonResponse
    {
        return response()->json(['integrity' => $verifier->verify()]);
    }
}
