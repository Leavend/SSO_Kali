<?php

declare(strict_types=1);

namespace App\Services\System;

use App\Services\ExternalIdp\ExternalIdpHealthProbeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

final class ReadinessProbeService
{
    public function __construct(
        private readonly QueueObservabilityService $queueObservability,
        private readonly ExternalIdpHealthProbeService $externalIdpHealth,
    ) {}

    /**
     * @return array{ready: bool, checks: array{database: bool, redis: bool, queue: array{pending_jobs: int, failed_jobs: int, oldest_pending_age_seconds: int|null}}}
     */
    public function inspect(): array
    {
        $checks = [
            'database' => $this->databaseIsReady(),
            'redis' => $this->redisIsReady(),
            'queue' => $this->queueObservability->snapshot(),
            'external_idps' => $this->externalIdpHealth->readinessSummary(),
        ];

        return [
            'ready' => $checks['database'] && $checks['redis'],
            'checks' => $checks,
        ];
    }

    private function databaseIsReady(): bool
    {
        try {
            DB::select('select 1');

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function redisIsReady(): bool
    {
        try {
            return Redis::connection()->ping() !== false;
        } catch (Throwable) {
            return false;
        }
    }
}
