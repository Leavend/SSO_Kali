<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Support\Performance\CpuMetricsRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class PerformanceMetricsController
{
    public function __invoke(CpuMetricsRegistry $metrics): JsonResponse
    {
        Gate::allowIf(fn () => app()->environment(['local', 'testing', 'staging']));

        return new JsonResponse($metrics->getMetricsSnapshot());
    }
}
