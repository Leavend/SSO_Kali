<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Services\System\QueueObservabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Config;

final class QueueMetricsController
{
    public function __invoke(QueueObservabilityService $queueObservability): JsonResponse
    {
        abort_unless(Config::boolean('sso.observability.internal_queue_metrics_enabled', false), 403);

        return new JsonResponse($queueObservability->snapshot());
    }
}
