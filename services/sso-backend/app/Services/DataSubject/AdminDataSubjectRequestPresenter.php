<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;

final class AdminDataSubjectRequestPresenter
{
    /**
     * @return array<string, mixed>
     */
    public function present(DataSubjectRequest $dataSubjectRequest): array
    {
        return [
            'request_id' => $dataSubjectRequest->request_id,
            'subject_id' => $dataSubjectRequest->subject_id,
            'type' => $dataSubjectRequest->type,
            'status' => $dataSubjectRequest->status,
            'reason' => $dataSubjectRequest->reason,
            'reviewer_subject_id' => $dataSubjectRequest->reviewer_subject_id,
            'reviewer_notes' => $dataSubjectRequest->reviewer_notes,
            'submitted_at' => $dataSubjectRequest->submitted_at->toIso8601String(),
            'reviewed_at' => $dataSubjectRequest->reviewed_at?->toIso8601String(),
            'fulfilled_at' => $dataSubjectRequest->fulfilled_at?->toIso8601String(),
            'sla_due_at' => $dataSubjectRequest->sla_due_at?->toIso8601String(),
        ];
    }
}
