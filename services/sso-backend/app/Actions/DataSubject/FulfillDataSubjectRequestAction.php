<?php

declare(strict_types=1);

namespace App\Actions\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\DataSubject\DataSubjectFulfillmentService;
use App\Services\DataSubject\DataSubjectRequestService;
use App\Services\DataSubject\DsrFulfillmentArtifactService;
use App\Services\DataSubject\DsrFulfillmentAuditRecorder;
use App\Services\DataSubject\DsrFulfillmentRequestResolver;
use App\Services\DataSubject\DsrFulfillmentResponseFactory;
use App\Services\DataSubject\DsrLegalHoldGuard;
use Illuminate\Http\Request;

final class FulfillDataSubjectRequestAction
{
    public function __construct(
        private readonly DsrFulfillmentRequestResolver $requests,
        private readonly DataSubjectFulfillmentService $fulfillment,
        private readonly DsrFulfillmentArtifactService $artifacts,
        private readonly DsrLegalHoldGuard $legalHold,
        private readonly DsrFulfillmentAuditRecorder $audit,
        private readonly DsrFulfillmentResponseFactory $responses,
    ) {}

    /** @return array<string, mixed> */
    public function execute(string $requestId, User $reviewer, Request $httpRequest, bool $dryRun = false): array
    {
        $request = $this->requests->approved($requestId);
        $holdStatus = $this->legalHold->status($request, $reviewer, $httpRequest);
        if ($holdStatus === 'active') {
            return $this->responses->make($request, ['summary' => 'DSR fulfillment is blocked by legal hold.'], false, null, $holdStatus);
        }

        return $dryRun
            ? $this->preview($request, $reviewer, $httpRequest, $holdStatus)
            : $this->fulfillRequest($request, $reviewer, $httpRequest, $holdStatus);
    }

    /** @return array<string, mixed> */
    private function preview(DataSubjectRequest $request, User $reviewer, Request $httpRequest, string $holdStatus): array
    {
        $stored = $this->artifacts->storeDryRun($request, $this->fulfillment->preview($request));
        $this->audit->record($request, $reviewer, $httpRequest, true, $stored, $holdStatus);

        return $this->responses->make($request, $stored->payload, true, $stored, $holdStatus);
    }

    /** @return array<string, mixed> */
    private function fulfillRequest(DataSubjectRequest $request, User $reviewer, Request $httpRequest, string $holdStatus): array
    {
        $dryRun = $this->artifacts->assertExecutable($request);
        $executed = $this->artifacts->withHash($this->fulfillment->fulfill($request));
        $this->markFulfilled($request);
        $this->audit->record($request, $reviewer, $httpRequest, false, $dryRun, $holdStatus, $executed);

        return $this->responses->make($request, $executed, false, $dryRun, $holdStatus);
    }

    private function markFulfilled(DataSubjectRequest $request): void
    {
        $request->forceFill([
            'status' => DataSubjectRequestService::STATUS_FULFILLED,
            'fulfilled_at' => now(),
            'expires_at' => now()->addDays(7),
        ])->save();
    }
}
