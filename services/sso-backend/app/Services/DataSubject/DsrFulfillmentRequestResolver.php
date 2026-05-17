<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Repositories\DataSubjectRequestRepository;
use RuntimeException;

final class DsrFulfillmentRequestResolver
{
    public function __construct(private readonly DataSubjectRequestRepository $requests) {}

    public function approved(string $requestId): DataSubjectRequest
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
}
