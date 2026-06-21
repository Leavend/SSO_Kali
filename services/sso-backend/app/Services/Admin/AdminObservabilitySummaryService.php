<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use App\Models\AuthenticationAuditEvent;
use App\Services\System\QueueObservabilityService;
use App\Services\System\ReadinessProbeService;
use App\Support\Performance\CpuMetricsRegistry;
use DateTimeInterface;
use Illuminate\Support\Facades\Log;
use Throwable;

final class AdminObservabilitySummaryService
{
    public function __construct(
        private readonly ReadinessProbeService $readiness,
        private readonly QueueObservabilityService $queue,
        private readonly CpuMetricsRegistry $cpuMetrics,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        $degraded = [];
        $readiness = $this->safe('readiness', fn (): array => $this->readiness->inspect(), [
            'ready' => false,
            'checks' => ['database' => false, 'redis' => false],
        ], $degraded);
        $queue = $this->safe('queue', fn (): array => $this->queue->snapshot(), [
            'pending_jobs' => 0,
            'failed_jobs' => 0,
            'oldest_pending_age_seconds' => null,
        ], $degraded);
        $performance = $this->safe('performance', fn (): array => $this->cpuMetrics->getMetricsSnapshot(), [], $degraded);

        return [
            'generated_at' => now()->toIso8601String(),
            'partial' => $degraded !== [],
            'degraded' => $degraded,
            'services' => $this->services($readiness, $queue),
            'metrics' => [
                'window_seconds' => 900,
                'queue' => $queue,
                'performance' => $performance,
                'auth_funnel' => $this->authFunnel(),
                'admin_activity' => $this->adminActivity(),
            ],
            'logs' => $this->recentCorrelatedEvents(),
            'traces' => [
                'status' => 'unavailable',
                'reason' => 'Distributed tracing is not instrumented yet for admin BFF, portal BFF, and sso-backend.',
                'next_step' => 'Propagate traceparent through BFF requests and export spans to an OpenTelemetry Collector/Tempo pipeline.',
                'last_seen_trace_id' => null,
            ],
        ];
    }

    /**
     * @param  callable(): array<string, mixed>  $resolver
     * @param  array<string, mixed>  $fallback
     * @param  list<string>  $degraded
     * @return array<string, mixed>
     */
    private function safe(string $section, callable $resolver, array $fallback, array &$degraded): array
    {
        try {
            return $resolver();
        } catch (Throwable $exception) {
            $degraded[] = $section;
            Log::warning('[ADMIN_OBSERVABILITY_SECTION_DEGRADED]', [
                'section' => $section,
                'exception' => $exception::class,
            ]);

            return $fallback;
        }
    }

    /**
     * @param  array<string, mixed>  $readiness
     * @param  array<string, mixed>  $queue
     * @return list<array<string, mixed>>
     */
    private function services(array $readiness, array $queue): array
    {
        $checks = is_array($readiness['checks'] ?? null) ? $readiness['checks'] : [];
        $backendReady = (bool) ($readiness['ready'] ?? false);

        return [
            [
                'key' => 'sso-backend',
                'name' => 'SSO-Backend',
                'status' => $backendReady ? 'healthy' : 'degraded',
                'summary' => $backendReady ? 'Database and Redis readiness checks passed.' : 'Readiness checks require attention.',
                'latency_p95_ms' => null,
                'request_rate_per_min' => $this->authEventsPerMinute(),
                'error_rate_percent' => $this->authErrorRatePercent(),
                'freshness_seconds' => 15,
                'checks' => $checks,
                'queue' => $queue,
            ],
            [
                'key' => 'sso-portal',
                'name' => 'SSO-Portal',
                'status' => 'unknown',
                'summary' => 'No admin-safe portal telemetry aggregator is wired yet; using authentication audit volume as indirect evidence.',
                'latency_p95_ms' => null,
                'request_rate_per_min' => $this->authEventsPerMinute(),
                'error_rate_percent' => $this->authErrorRatePercent(),
                'freshness_seconds' => null,
                'checks' => [],
            ],
            [
                'key' => 'admin-sso',
                'name' => 'Admin-SSO',
                'status' => 'healthy',
                'summary' => 'Admin API observability summary is reachable through the authenticated BFF path.',
                'latency_p95_ms' => null,
                'request_rate_per_min' => $this->adminEventsPerMinute(),
                'error_rate_percent' => $this->adminDeniedRatePercent(),
                'freshness_seconds' => 15,
                'checks' => ['api' => true],
            ],
        ];
    }

    /**
     * @return array<string, int|float>
     */
    private function authFunnel(): array
    {
        $start = now()->subMinutes(15);
        $total = (int) AuthenticationAuditEvent::query()->where('occurred_at', '>=', $start)->count();
        $failed = (int) AuthenticationAuditEvent::query()->where('occurred_at', '>=', $start)->where('outcome', 'failed')->count();
        $succeeded = (int) AuthenticationAuditEvent::query()->where('occurred_at', '>=', $start)->where('outcome', 'succeeded')->count();

        return [
            'total_15m' => $total,
            'succeeded_15m' => $succeeded,
            'failed_15m' => $failed,
            'failure_rate_percent' => $total === 0 ? 0.0 : round(($failed / $total) * 100, 2),
        ];
    }

    /**
     * @return array<string, int|float>
     */
    private function adminActivity(): array
    {
        $start = now()->subMinutes(15);
        $total = (int) AdminAuditEvent::query()->where('occurred_at', '>=', $start)->count();
        $denied = (int) AdminAuditEvent::query()->where('occurred_at', '>=', $start)->where('outcome', 'denied')->count();

        return [
            'total_15m' => $total,
            'denied_15m' => $denied,
            'denied_rate_percent' => $total === 0 ? 0.0 : round(($denied / $total) * 100, 2),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recentCorrelatedEvents(): array
    {
        $events = [];

        foreach (AdminAuditEvent::query()->latest('occurred_at')->limit(6)->get() as $event) {
            $events[] = [
                'id' => $event->event_id,
                'service' => 'admin-sso',
                'severity' => $event->outcome === 'denied' || $event->outcome === 'failed' ? 'warning' : 'info',
                'message' => $event->action,
                'reference' => SupportReference::fromRequestId($event->request_id) ?? SupportReference::fromRequestId($event->event_id),
                'occurred_at' => $this->timestamp($event->occurred_at),
            ];
        }

        foreach (AuthenticationAuditEvent::query()->latest('occurred_at')->limit(6)->get() as $event) {
            $events[] = [
                'id' => $event->event_id,
                'service' => 'sso-backend',
                'severity' => $event->outcome === 'failed' ? 'warning' : 'info',
                'message' => $event->event_type,
                'reference' => SupportReference::fromRequestId($event->request_id) ?? SupportReference::fromRequestId($event->event_id),
                'occurred_at' => $this->timestamp($event->occurred_at),
            ];
        }

        usort(
            $events,
            static fn (array $a, array $b): int => strcmp((string) ($b['occurred_at'] ?? ''), (string) ($a['occurred_at'] ?? '')),
        );

        return array_slice($events, 0, 10);
    }

    private function timestamp(mixed $value): ?string
    {
        return $value instanceof DateTimeInterface ? $value->format(DATE_ATOM) : null;
    }

    private function authEventsPerMinute(): float
    {
        return round($this->authFunnel()['total_15m'] / 15, 2);
    }

    private function authErrorRatePercent(): float
    {
        return (float) $this->authFunnel()['failure_rate_percent'];
    }

    private function adminEventsPerMinute(): float
    {
        return round($this->adminActivity()['total_15m'] / 15, 2);
    }

    private function adminDeniedRatePercent(): float
    {
        return (float) $this->adminActivity()['denied_rate_percent'];
    }
}
