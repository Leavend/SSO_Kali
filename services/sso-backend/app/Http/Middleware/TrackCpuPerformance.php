<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Performance\CpuMetricsRegistry;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
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
        $durationMs = (microtime(true) - $startedAt) * 1000;

        if (app()->environment(['local', 'testing', 'staging'])) {
            $this->attachMetricsToResponse($response, $durationMs);
        }

        $this->logRequestTiming($request, $response, $durationMs);

        return $response;
    }

    /**
     * @return array{should_log: bool, sampled: bool}
     */
    private function timingDecision(float $durationMs): array
    {
        if (! (bool) config('sso.observability.request_timing_log_enabled', false)) {
            return ['should_log' => false, 'sampled' => false];
        }

        $slowMs = (float) config('sso.observability.request_timing_slow_ms', 500);
        if ($durationMs >= $slowMs) {
            return ['should_log' => true, 'sampled' => false];
        }

        $sampleRate = max(0.0, min(1.0, (float) config('sso.observability.request_timing_sample_rate', 0.0)));
        $sampled = $sampleRate > 0.0 && mt_rand() / mt_getrandmax() <= $sampleRate;

        return ['should_log' => $sampled, 'sampled' => $sampled];
    }

    private function attachMetricsToResponse(Response $response, float $durationMs): void
    {
        $metrics = $this->metrics->getMetricsSnapshot();

        $response->headers->set('X-CPU-Request-Duration-Ms', number_format($durationMs, 2));
        $response->headers->set('X-CPU-Operations', (string) $metrics['totals']['operations']);
        $response->headers->set('X-CPU-Cache-Hit-Ratio', number_format($metrics['cache_operations']['hit_ratio'] * 100, 1).'%');
    }

    private function logRequestTiming(Request $request, Response $response, float $durationMs): void
    {
        $decision = $this->timingDecision($durationMs);
        if (! $decision['should_log']) {
            return;
        }

        Log::info('sso.request_timing', [
            'method' => $request->method(),
            'path' => '/'.ltrim($request->path(), '/'),
            'status' => $response->getStatusCode(),
            'duration_ms' => round($durationMs, 2),
            'memory_peak_mb' => round(memory_get_peak_usage(true) / 1048576, 2),
            'request_id' => $request->headers->get('X-Request-Id'),
            'route' => $request->route()?->getName(),
            'client_ip_hash' => $this->hashNullable($request->ip()),
            'user_agent_hash' => $this->hashNullable($request->userAgent()),
            'content_length' => (int) ($request->headers->get('Content-Length') ?? 0),
            'query_count' => 0,
            'sampled' => $decision['sampled'],
        ]);
    }

    private function hashNullable(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return hash('sha256', Str::limit($value, 256, ''));
    }
}
