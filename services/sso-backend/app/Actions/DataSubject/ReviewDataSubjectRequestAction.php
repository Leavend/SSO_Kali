<?php

declare(strict_types=1);

namespace App\Actions\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Repositories\DataSubjectRequestRepository;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Http\Request;
use RuntimeException;

final class ReviewDataSubjectRequestAction
{
    public function __construct(
        private readonly DataSubjectRequestRepository $requests,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function execute(
        string $requestId,
        User $reviewer,
        string $decision,
        ?string $notes,
        Request $request,
    ): DataSubjectRequest {
        $dataSubjectRequest = $this->reviewableRequest($requestId);
        $this->assertDecision($decision);

        $dataSubjectRequest->forceFill([
            'status' => $decision,
            'reviewer_subject_id' => $reviewer->subject_id,
            'reviewer_notes' => $notes,
            'reviewed_at' => now(),
        ])->save();

        $this->recordAudit($dataSubjectRequest, $reviewer, $request, $decision);

        return $dataSubjectRequest->refresh();
    }

    private function reviewableRequest(string $requestId): DataSubjectRequest
    {
        $request = $this->requests->findByRequestId($requestId);
        if (! $request instanceof DataSubjectRequest) {
            throw new RuntimeException('DSR not found.');
        }
        if ($request->status !== DataSubjectRequestService::STATUS_SUBMITTED) {
            throw new RuntimeException('DSR is not in a reviewable state.');
        }

        return $request;
    }

    private function assertDecision(string $decision): void
    {
        if (! in_array($decision, [DataSubjectRequestService::STATUS_APPROVED, DataSubjectRequestService::STATUS_REJECTED], true)) {
            throw new RuntimeException('Unsupported DSR review decision.');
        }
    }

    private function recordAudit(
        DataSubjectRequest $dataSubjectRequest,
        User $reviewer,
        Request $request,
        string $decision,
    ): void {
        $this->audit->succeeded('review_data_subject_request', $request, $reviewer, [
            'request_id' => $dataSubjectRequest->request_id,
            'type' => $dataSubjectRequest->type,
            'decision' => $decision,
            'sla_due_at' => $dataSubjectRequest->sla_due_at?->toIso8601String(),
        ], AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);
    }
}
