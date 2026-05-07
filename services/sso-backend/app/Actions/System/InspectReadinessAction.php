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
     * @return array{service: string, ready: bool, checks: array{database: bool, redis: bool}}
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
