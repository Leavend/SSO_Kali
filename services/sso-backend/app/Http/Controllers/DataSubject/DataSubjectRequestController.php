<?php

declare(strict_types=1);

namespace App\Http\Controllers\DataSubject;

use App\Actions\DataSubject\SubmitDataSubjectRequestAction;
use App\Http\Requests\DataSubject\StoreDataSubjectRequest;
use App\Models\DataSubjectRequest;
use App\Services\DataSubject\DataSubjectRequestService;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DataSubjectRequestController
{
    public function __construct(
        private readonly DataSubjectRequestService $service,
        private readonly ProfilePrincipalResolver $principals,
    ) {}

    public function index(Request $request): JsonResponse
    {
        try {
            $user = $this->principals->resolve($request)['user'];
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        return response()->json([
            'requests' => $this->service->listForSubject($user->subject_id)
                ->map(fn (DataSubjectRequest $dsr): array => $this->service->present($dsr))
                ->values()
                ->all(),
        ])
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache');
    }

    public function store(StoreDataSubjectRequest $request, SubmitDataSubjectRequestAction $submit): JsonResponse
    {
        try {
            $user = $this->principals->resolve($request)['user'];
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        $dsr = $submit->execute(
            $user,
            (string) $request->validated('type'),
            $this->optionalString($request->validated('reason')),
            $request,
        );

        return response()->json(['request' => $this->service->present($dsr)], 201)
            ->header('Cache-Control', 'no-store');
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
