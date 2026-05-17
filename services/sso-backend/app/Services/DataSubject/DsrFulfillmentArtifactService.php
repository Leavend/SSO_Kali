<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\DsrFulfillmentArtifact;
use Illuminate\Support\Arr;
use RuntimeException;

final class DsrFulfillmentArtifactService
{
    /**
     * @param  array<string, mixed>  $artifact
     */
    public function storeDryRun(DataSubjectRequest $request, array $artifact): DsrFulfillmentArtifact
    {
        $payload = $this->withHash($artifact);

        return DsrFulfillmentArtifact::query()->create([
            'data_subject_request_id' => $request->id,
            'type' => $request->type,
            'dry_run' => true,
            'payload' => $payload,
            'hash' => (string) $payload['hash'],
            'expires_at' => now()->addHours($this->ttlHours()),
        ]);
    }

    public function assertExecutable(DataSubjectRequest $request): DsrFulfillmentArtifact
    {
        $artifact = $this->latestDryRun($request);
        if (! $artifact instanceof DsrFulfillmentArtifact) {
            throw new RuntimeException('DSR execute requires recent dry-run artifact.');
        }
        if ($artifact->hash !== $this->hash($this->unsignedPayload($artifact->payload))) {
            throw new RuntimeException('DSR execute requires recent dry-run artifact.');
        }

        return $artifact;
    }

    /**
     * @param  array<string, mixed>  $artifact
     * @return array<string, mixed>
     */
    public function withHash(array $artifact): array
    {
        $payload = $this->unsignedPayload($artifact);

        return [...$payload, 'hash' => $this->hash($payload)];
    }

    private function latestDryRun(DataSubjectRequest $request): ?DsrFulfillmentArtifact
    {
        $artifact = $request->fulfillmentArtifacts()
            ->where('dry_run', true)
            ->where('type', $request->type)
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        return $artifact instanceof DsrFulfillmentArtifact ? $artifact : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function unsignedPayload(array $payload): array
    {
        return Arr::except($payload, ['hash']);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function hash(array $payload): string
    {
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    private function ttlHours(): int
    {
        return max(1, (int) config('dsr.dry_run_artifact_ttl_hours', 24));
    }
}
