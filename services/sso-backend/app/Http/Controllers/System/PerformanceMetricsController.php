<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Support\Performance\CpuMetricsRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Gate;

final class PerformanceMetricsController
{
    public function __invoke(CpuMetricsRegistry $metrics): JsonResponse
    {
        // When a header token is configured the EnsureInternalMetricsToken
        // middleware is the authoritative gate. Otherwise fall back to the
        // legacy env-based gate so non-production environments stay usable.
        $tokenConfigured = is_string(Config::get('sso.observability.internal_metrics_token'))
            && trim((string) Config::get('sso.observability.internal_metrics_token')) !== '';

        if (! $tokenConfigured) {
            Gate::allowIf(fn () => app()->environment(['local', 'testing', 'staging']));
        }

        return new JsonResponse($metrics->getMetricsSnapshot());
    }
}
