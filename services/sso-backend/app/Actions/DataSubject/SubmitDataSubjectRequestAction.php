<?php

declare(strict_types=1);

namespace App\Actions\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

final class SubmitDataSubjectRequestAction
{
    public function __construct(private readonly AdminAuditLogger $audit) {}

    public function execute(User $subject, string $type, ?string $reason, Request $request): DataSubjectRequest
    {
        $this->assertType($type);
        $now = now();

        $dataSubjectRequest = DataSubjectRequest::query()->create([
            'request_id' => (string) Str::ulid(),
            'subject_id' => $subject->subject_id,
            'type' => $type,
            'status' => DataSubjectRequestService::STATUS_SUBMITTED,
            'reason' => $reason,
            'context' => $this->context($request),
            'submitted_at' => $now,
            'sla_due_at' => $now->copy()->addHours(DataSubjectRequestService::SLA_HOURS),
        ]);

        $this->recordAudit($dataSubjectRequest, $subject, $request);

        return $dataSubjectRequest;
    }

    private function assertType(string $type): void
    {
        if (! in_array($type, DataSubjectRequest::TYPES, true)) {
            throw new RuntimeException('Unsupported data subject request type.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function context(Request $request): array
    {
        return [
            'request_id' => $request->headers->get('X-Request-Id'),
            'submitted_via' => 'self_service',
        ];
    }

    private function recordAudit(DataSubjectRequest $dataSubjectRequest, User $subject, Request $request): void
    {
        $this->audit->succeeded('submit_data_subject_request', $request, $subject, [
            'request_id' => $dataSubjectRequest->request_id,
            'type' => $dataSubjectRequest->type,
            'sla_due_at' => $dataSubjectRequest->sla_due_at?->toIso8601String(),
        ], AdminAuditTaxonomy::PROFILE_SELF_UPDATE);
    }
}
