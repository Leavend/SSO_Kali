<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\DsrFulfillmentArtifact;

final class DsrFulfillmentResponseFactory
{
    /**
     * @param  array<string, mixed>  $artifact
     * @return array<string, mixed>
     */
    public function make(
        DataSubjectRequest $request,
        array $artifact,
        bool $dryRun,
        ?DsrFulfillmentArtifact $storedArtifact,
        string $legalHoldStatus,
    ): array {
        return [
            'request' => $request->fresh()?->toArray() ?? $request->toArray(),
            'artifact' => $artifact,
            'artifact_id' => $storedArtifact?->id,
            'dry_run' => $dryRun,
            'legal_hold_status' => $legalHoldStatus,
        ];
    }
}
