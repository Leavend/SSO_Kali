<?php

declare(strict_types=1);

namespace App\Actions\System;

use App\Services\System\ReadinessProbeService;

final class InspectReadinessAction
{
    public function __construct(
        private readonly ReadinessProbeService $readinessProbe,
    ) {}

    /**
     * @return array{service: string, ready: bool, checks: array{database: bool, redis: bool, queue: array{pending_jobs: int, failed_jobs: int, oldest_pending_age_seconds: int|null}}}
     */
    public function execute(): array
    {
        $result = $this->readinessProbe->inspect();

        return [
            'service' => 'sso-backend',
            'ready' => $result['ready'],
            'checks' => $result['checks'],
        ];
    }
}
