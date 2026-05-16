<?php

declare(strict_types=1);

namespace App\Http\Controllers\DataSubject;

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

        $rows = [];
        foreach ($this->service->listing(['subject_id' => $user->subject_id])->limit(50)->get() as $dsr) {
            \assert($dsr instanceof DataSubjectRequest);
            $rows[] = $this->present($dsr);
        }

        return response()->json(['requests' => $rows])
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache');
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $user = $this->principals->resolve($request)['user'];
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }

        $data = $request->validate([
            'type' => ['required', 'in:export,delete,anonymize'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $dsr = $this->service->submit($user, $data['type'], $data['reason'] ?? null, $request);

        return response()->json(['request' => $this->present($dsr)], 201)
            ->header('Cache-Control', 'no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function present(DataSubjectRequest $dsr): array
    {
        $submittedAt = $dsr->submitted_at;

        return [
            'request_id' => $dsr->request_id,
            'type' => $dsr->type,
            'status' => $dsr->status,
            'reason' => $dsr->reason,
            'submitted_at' => $submittedAt->toIso8601String(),
            'reviewed_at' => $dsr->reviewed_at?->toIso8601String(),
            'fulfilled_at' => $dsr->fulfilled_at?->toIso8601String(),
            'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
        ];
    }
}
