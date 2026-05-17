<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Security\SecurityPolicyService;
use Illuminate\Http\Request;

final class DsrLegalHoldGuard
{
    public function __construct(
        private readonly SecurityPolicyService $policies,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function status(DataSubjectRequest $request, User $reviewer, Request $httpRequest): string
    {
        if (! $this->policies->hasLegalHold($request->subject_id)) {
            return 'clear';
        }

        $this->markOnHold($request);
        $this->record($request, $reviewer, $httpRequest);

        return 'active';
    }

    private function markOnHold(DataSubjectRequest $request): void
    {
        $request->forceFill(['status' => DataSubjectRequestService::STATUS_ON_HOLD])->save();
    }

    private function record(DataSubjectRequest $request, User $reviewer, Request $httpRequest): void
    {
        $this->audit->succeeded('data_subject_request.on_hold', $httpRequest, $reviewer, [
            'request_id' => $request->request_id,
            'type' => $request->type,
            'legal_hold_status' => 'active',
        ], AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);
    }
}
