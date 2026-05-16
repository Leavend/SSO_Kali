<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DataSubjectRequestAdminController
{
    public function __construct(private readonly DataSubjectRequestService $service) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:submitted,approved,rejected,fulfilled,cancelled'],
            'type' => ['nullable', 'in:export,delete,anonymize'],
            'subject_id' => ['nullable', 'string', 'max:64'],
        ]);

        $rows = [];
        foreach ($this->service->listing($filters)->limit(100)->get() as $dsr) {
            \assert($dsr instanceof DataSubjectRequest);
            $rows[] = $this->present($dsr);
        }

        return response()->json(['requests' => $rows])
            ->header('Cache-Control', 'no-store');
    }

    public function review(Request $request, string $requestId): JsonResponse
    {
        $payload = $request->validate([
            'decision' => ['required', 'in:approved,rejected'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $dsr = DataSubjectRequest::query()->where('request_id', $requestId)->firstOrFail();
        $reviewer = $this->reviewer($request);

        $dsr = $this->service->review($dsr, $reviewer, $payload['decision'], $payload['notes'] ?? null, $request);

        return response()->json(['request' => $this->present($dsr)])
            ->header('Cache-Control', 'no-store');
    }

    public function fulfill(Request $request, string $requestId): JsonResponse
    {
        $payload = $request->validate([
            'dry_run' => ['nullable', 'boolean'],
        ]);

        $dsr = DataSubjectRequest::query()->where('request_id', $requestId)->firstOrFail();
        $reviewer = $this->reviewer($request);

        $result = $this->service->fulfill($dsr, $reviewer, $request, (bool) ($payload['dry_run'] ?? false));

        return response()->json($result)->header('Cache-Control', 'no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function present(DataSubjectRequest $dsr): array
    {
        $submittedAt = $dsr->submitted_at;

        return [
            'request_id' => $dsr->request_id,
            'subject_id' => $dsr->subject_id,
            'type' => $dsr->type,
            'status' => $dsr->status,
            'reason' => $dsr->reason,
            'reviewer_subject_id' => $dsr->reviewer_subject_id,
            'reviewer_notes' => $dsr->reviewer_notes,
            'submitted_at' => $submittedAt->toIso8601String(),
            'reviewed_at' => $dsr->reviewed_at?->toIso8601String(),
            'fulfilled_at' => $dsr->fulfilled_at?->toIso8601String(),
            'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
        ];
    }

    private function reviewer(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user') ?? $request->user();

        return $admin;
    }
}
