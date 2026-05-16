<?php

declare(strict_types=1);

namespace App\Actions\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Repositories\DataSubjectRequestRepository;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\DataSubject\DataSubjectFulfillmentService;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Http\Request;
use RuntimeException;

final class FulfillDataSubjectRequestAction
{
    public function __construct(
        private readonly DataSubjectRequestRepository $requests,
        private readonly DataSubjectFulfillmentService $fulfillment,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function execute(string $requestId, User $reviewer, Request $httpRequest, bool $dryRun = false): array
    {
        $dataSubjectRequest = $this->request($requestId);
        $artifact = $dryRun
            ? $this->fulfillment->preview($dataSubjectRequest)
            : $this->fulfillment->fulfill($dataSubjectRequest);

        if (! $dryRun) {
            $this->markFulfilled($dataSubjectRequest);
        }
        $this->recordAudit($dataSubjectRequest, $reviewer, $httpRequest, $dryRun, $artifact);

        return [
            'request' => $dataSubjectRequest->fresh()?->toArray() ?? $dataSubjectRequest->toArray(),
            'artifact' => $artifact,
            'dry_run' => $dryRun,
        ];
    }

    private function request(string $requestId): DataSubjectRequest
    {
        $request = $this->requests->findByRequestId($requestId);
        if (! $request instanceof DataSubjectRequest) {
            throw new RuntimeException('DSR not found.');
        }
        if ($request->status !== DataSubjectRequestService::STATUS_APPROVED) {
            throw new RuntimeException('DSR must be approved before fulfilment.');
        }

        return $request;
    }

    private function markFulfilled(DataSubjectRequest $request): void
    {
        $request->forceFill([
            'status' => DataSubjectRequestService::STATUS_FULFILLED,
            'fulfilled_at' => now(),
            'expires_at' => now()->addDays(7),
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $artifact
     */
    private function recordAudit(
        DataSubjectRequest $request,
        User $reviewer,
        Request $httpRequest,
        bool $dryRun,
        array $artifact,
    ): void {
        $this->audit->succeeded('fulfill_data_subject_request', $httpRequest, $reviewer, [
            'request_id' => $request->request_id,
            'type' => $request->type,
            'dry_run' => $dryRun,
            'summary' => $artifact['summary'] ?? null,
            'sla_due_at' => $request->sla_due_at?->toIso8601String(),
        ], AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);
    }
}
