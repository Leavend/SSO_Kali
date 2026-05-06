<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Performance\CpuMetricsRegistry;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class TrackCpuPerformance
{
    public function __construct(
        private readonly CpuMetricsRegistry $metrics,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $response = $next($request);

        if (app()->environment(['local', 'testing', 'staging'])) {
            $this->attachMetricsToResponse($response, (microtime(true) - $startedAt) * 1000);
        }

        return $response;
    }

    private function attachMetricsToResponse(Response $response, float $durationMs): void
    {
        $metrics = $this->metrics->getMetricsSnapshot();

        $response->headers->set('X-CPU-Request-Duration-Ms', number_format($durationMs, 2));
        $response->headers->set('X-CPU-Operations', (string) $metrics['totals']['operations']);
        $response->headers->set('X-CPU-Cache-Hit-Ratio', number_format($metrics['cache_operations']['hit_ratio'] * 100, 1).'%');
    }
}
