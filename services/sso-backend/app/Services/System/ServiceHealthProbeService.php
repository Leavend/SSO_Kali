<?php

declare(strict_types=1);

namespace App\Services\System;

use GuzzleHttp\TransferStats;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ServiceHealthProbeService
{
    public const ERROR_SUBSYSTEM_FAILED = 'Health probe subsystem failed before target response.';

    private const DEFAULT_HEALTHY_TTL_SECONDS = 30;

    private const DEFAULT_FAILURE_TTL_SECONDS = 3;

    private const DEFAULT_TIMEOUT_SECONDS = 3;

    private const DEFAULT_DEGRADED_LATENCY_MS = 1000;

    private const DEFAULT_LOG_THROTTLE_SECONDS = 60;


    /**
     * Probes the health endpoint for a given service target key.
     *
     * @param  string  $key  e.g., 'sso-portal', 'admin-sso', 'sso-backend'
     * @return array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}
     */
    public function probe(string $key): array
    {
        return $this->probeMany([$key])[$key];
    }

    /**
     * Probes health endpoints for multiple service target keys concurrently.
     *
     * @param  array<int, string>  $keys
     * @return array<string, array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}>
     */
    public function probeMany(array $keys): array
    {
        $healthyTtl = $this->positiveConfigInt('sso.observability.probe_cache_ttl_healthy_seconds', self::DEFAULT_HEALTHY_TTL_SECONDS);
        $failureTtl = $this->positiveConfigInt('sso.observability.probe_cache_ttl_failure_seconds', self::DEFAULT_FAILURE_TTL_SECONDS);
        $timeoutSeconds = $this->positiveConfigInt('sso.observability.probe_timeout_seconds', self::DEFAULT_TIMEOUT_SECONDS);
        $degradedLatencyMs = $this->positiveConfigInt('sso.observability.probe_degraded_latency_ms', self::DEFAULT_DEGRADED_LATENCY_MS);
        $results = [];
        $toProbe = [];

        foreach ($keys as $key) {
            $target = ServiceHealthProbeTarget::tryFrom($key);
            $cached = $target === null ? null : Cache::get($target->cacheKey());
            if (is_array($cached)) {
                $results[$key] = $cached;

                continue;
            }

            if ($target === null) {
                $results[$key] = $this->result('unknown', null, 'Unknown target service key.', $healthyTtl);

                continue;
            }

            $url = config($target->configKey());
            if (! is_string($url) || trim($url) === '') {
                $results[$key] = $this->result('unknown', null, 'Target URL is not configured.', $healthyTtl);

                continue;
            }

            $toProbe[$key] = ['target' => $target, 'url' => $url];
        }

        if ($toProbe === []) {
            return $results;
        }

        $latencies = [];
        $responses = [];

        try {
            $responses = Http::pool(function (Pool $pool) use ($toProbe, $timeoutSeconds, &$latencies): array {
                $requests = [];
                foreach ($toProbe as $key => $probeTarget) {
                    $requests[] = $pool->as($key)->withOptions([
                        'allow_redirects' => false,
                        'on_stats' => function (TransferStats $stats) use ($key, &$latencies): void {
                            $time = $stats->getTransferTime();
                            if ($time > 0.0) {
                                $latencies[$key] = round($time * 1000, 2);
                            }
                        },
                    ])->timeout($timeoutSeconds)->get($probeTarget['url']);
                }

                return $requests;
            });
        } catch (Throwable $exception) {
            foreach ($toProbe as $key => $probeTarget) {
                $this->logConnectionFailure($key, $exception);
                $results[$key] = $this->cacheResult(
                    $probeTarget['target'],
                    $this->result('degraded', null, self::ERROR_SUBSYSTEM_FAILED, $failureTtl),
                    $failureTtl,
                );
            }

            return $results;
        }

        foreach ($toProbe as $key => $probeTarget) {
            $response = $responses[$key] ?? null;
            $latency = $latencies[$key] ?? null;
            [$result, $ttl] = $this->classify($key, $response, $latency, $healthyTtl, $failureTtl, $degradedLatencyMs);
            $results[$key] = $this->cacheResult($probeTarget['target'], $result, $ttl);
        }

        return $results;
    }

    /**
     * @return array{0: array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}, 1: int}
     */
    private function classify(string $key, mixed $response, ?float $latency, int $healthyTtl, int $failureTtl, int $degradedLatencyMs): array
    {
        if ($response instanceof Throwable) {
            $this->logConnectionFailure($key, $response);

            return [$this->result('down', null, 'Connection failed.', $failureTtl), $failureTtl];
        }

        if (! $response instanceof Response) {
            return [$this->result('down', null, 'Connection failed.', $failureTtl), $failureTtl];
        }

        if ($response->successful()) {
            if ($latency !== null && $latency >= $degradedLatencyMs) {
                return [$this->result('degraded', $latency, 'Slow response: '.$latency.'ms', $failureTtl), $failureTtl];
            }

            return [$this->result('healthy', $latency, null, $healthyTtl), $healthyTtl];
        }

        if ($response->status() >= 300 && $response->status() < 400) {
            return [$this->result('degraded', $latency, 'Redirect response: '.$response->status(), $failureTtl), $failureTtl];
        }

        if ($response->status() >= 400 && $response->status() < 500) {
            return [$this->result('degraded', $latency, 'Client error response: '.$response->status(), $failureTtl), $failureTtl];
        }

        if ($response->status() >= 500) {
            return [$this->result('down', $latency, 'Server error response: '.$response->status(), $failureTtl), $failureTtl];
        }

        return [$this->result('degraded', $latency, 'Unexpected response: '.$response->status(), $failureTtl), $failureTtl];
    }

    /**
     * @param  'healthy'|'degraded'|'down'|'unknown'  $status
     * @return array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}
     */
    private function result(string $status, ?float $latency, ?string $error, int $freshnessSeconds): array
    {
        return [
            'status' => $status,
            'latency_ms' => $latency,
            'error' => $error,
            'freshness_seconds' => $freshnessSeconds,
        ];
    }

    /**
     * @param  array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}  $result
     * @return array{status: 'healthy'|'degraded'|'down'|'unknown', latency_ms: float|null, error: string|null, freshness_seconds: int}
     */
    private function cacheResult(ServiceHealthProbeTarget $target, array $result, int $ttl): array
    {
        Cache::put($target->cacheKey(), $result, max(1, $ttl));

        return $result;
    }

    private function logConnectionFailure(string $key, Throwable $exception): void
    {
        $fingerprint = sha1($key.'|'.$exception::class.'|'.$exception->getMessage());
        $cacheKey = 'service_health_probe_log:'.$fingerprint;

        $throttleSeconds = $this->positiveConfigInt('sso.observability.probe_log_throttle_seconds', self::DEFAULT_LOG_THROTTLE_SECONDS);
        if (! Cache::add($cacheKey, true, $throttleSeconds)) {
            return;
        }

        Log::warning('[SERVICE_HEALTH_PROBE_ERROR]', [
            'key' => $key,
            'exception' => $exception::class,
            'error' => $exception->getMessage(),
        ]);
    }

    private function positiveConfigInt(string $key, int $default): int
    {
        return max(1, (int) config($key, $default));
    }
}
