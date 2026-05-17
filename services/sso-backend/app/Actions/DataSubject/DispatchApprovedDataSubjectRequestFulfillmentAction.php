<?php

declare(strict_types=1);

namespace App\Actions\DataSubject;

use App\Jobs\FulfillApprovedDataSubjectRequestJob;
use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Repositories\DataSubjectRequestRepository;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Http\Request;
use RuntimeException;

final class DispatchApprovedDataSubjectRequestFulfillmentAction
{
    public function __construct(private readonly DataSubjectRequestRepository $requests) {}

    public function execute(string $requestId, User $reviewer, Request $request): DataSubjectRequest
    {
        $dataSubjectRequest = $this->approvedRequest($requestId);

        FulfillApprovedDataSubjectRequestJob::dispatch(
            $dataSubjectRequest->request_id,
            $reviewer->id,
            $request->ip() ?? '127.0.0.1',
            (string) $request->headers->get('X-Request-Id', 'queued-dsr-'.$dataSubjectRequest->request_id),
        );

        return $dataSubjectRequest;
    }

    private function approvedRequest(string $requestId): DataSubjectRequest
    {
        $dataSubjectRequest = $this->requests->findByRequestId($requestId);
        if (! $dataSubjectRequest instanceof DataSubjectRequest) {
            throw new RuntimeException('DSR not found.');
        }
        if ($dataSubjectRequest->status !== DataSubjectRequestService::STATUS_APPROVED) {
            throw new RuntimeException('DSR must be approved before fulfilment.');
        }

        return $dataSubjectRequest;
    }
}
