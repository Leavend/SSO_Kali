<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\DsrFulfillmentArtifact;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;

final class DsrFulfillmentAuditRecorder
{
    public function __construct(private readonly AdminAuditLogger $audit) {}

    /**
     * @param  array<string, mixed>|null  $executedArtifact
     */
    public function record(
        DataSubjectRequest $request,
        User $reviewer,
        Request $httpRequest,
        bool $dryRun,
        DsrFulfillmentArtifact $artifact,
        string $legalHoldStatus,
        ?array $executedArtifact = null,
    ): void {
        $this->audit->succeeded('fulfill_data_subject_request', $httpRequest, $reviewer, [
            'request_id' => $request->request_id,
            'type' => $request->type,
            'dry_run' => $dryRun,
            'artifact_id' => $artifact->id,
            'artifact_hash' => $artifact->hash,
            'legal_hold_status' => $legalHoldStatus,
            'pii_table_counts' => $this->counts($artifact, $executedArtifact),
            'summary' => $this->summary($artifact, $executedArtifact),
        ], AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);
    }

    /**
     * @param  array<string, mixed>|null  $executedArtifact
     * @return array<string, mixed>
     */
    private function counts(DsrFulfillmentArtifact $artifact, ?array $executedArtifact): array
    {
        $counts = $executedArtifact['table_counts'] ?? $artifact->payload['table_counts'] ?? [];

        return is_array($counts) ? $counts : [];
    }

    /** @param array<string, mixed>|null $executedArtifact */
    private function summary(DsrFulfillmentArtifact $artifact, ?array $executedArtifact): ?string
    {
        $summary = $executedArtifact['summary'] ?? $artifact->payload['summary'] ?? null;

        return is_string($summary) ? $summary : null;
    }
}
