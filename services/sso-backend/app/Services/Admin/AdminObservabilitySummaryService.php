<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use App\Models\AuthenticationAuditEvent;
use App\Services\System\QueueObservabilityService;
use App\Services\System\ReadinessProbeService;
use App\Services\System\ServiceHealthProbeService;
use App\Services\System\ServiceHealthProbeTarget;
use App\Support\Performance\CpuMetricsRegistry;
use DateTimeInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

final class AdminObservabilitySummaryService
{
    public function __construct(
        private readonly ReadinessProbeService $readiness,
        private readonly QueueObservabilityService $queue,
        private readonly CpuMetricsRegistry $cpuMetrics,
        private readonly ServiceHealthProbeService $healthProbe,
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
                'freshness_seconds' => $this->summaryMetricsTtl(),
                'queue' => $queue,
                'performance' => $performance,
                'auth_funnel' => $this->authFunnel(),
                'admin_activity' => $this->adminActivity(),
            ],
            'freshness' => [
                'recent_events_seconds' => $this->recentEventsTtl(),
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

        $backendStatus = $backendReady ? 'healthy' : 'degraded';
        $backendSummaryParts = [];

        if ($backendReady) {
            $backendSummaryParts[] = 'Database and Redis readiness checks passed.';
        } else {
            $backendSummaryParts[] = 'Readiness checks require attention.';
        }

        $probes = $this->healthProbe->probeMany([ServiceHealthProbeTarget::Portal->value, ServiceHealthProbeTarget::Admin->value]);

        $services = [
            [
                'key' => ServiceHealthProbeTarget::Backend->value,
                'name' => 'SSO-Backend',
                'status' => $backendStatus,
                'summary' => implode(' ', $backendSummaryParts),
                'latency_p95_ms' => null,
                'freshness_seconds' => 0,
                'checks' => $checks,
                'queue' => $queue,
            ],
        ];

        foreach ([
            ServiceHealthProbeTarget::Portal->value => ['name' => 'SSO-Portal', 'label' => 'Portal BFF'],
            ServiceHealthProbeTarget::Admin->value => ['name' => 'Admin-SSO', 'label' => 'Admin BFF'],
        ] as $key => $metadata) {
            $probe = $probes[$key];
            $status = $probe['status'];
            $services[] = [
                'key' => $key,
                'name' => $metadata['name'],
                'status' => $status,
                'summary' => $this->serviceSummary($metadata['label'], $probe),
                'latency_p95_ms' => $probe['latency_ms'],
                'freshness_seconds' => $probe['freshness_seconds'],
                'checks' => $key === ServiceHealthProbeTarget::Admin->value ? ['api' => $status === 'healthy'] : [],
            ];
        }

        return $services;
    }

    /**
     * @param  array{status: string, latency_ms: float|null, error: string|null, freshness_seconds: int}  $probe
     */
    private function serviceSummary(string $label, array $probe): string
    {
        $error = is_string($probe['error']) && $probe['error'] !== '' ? ': '.$probe['error'] : '.';

        if ($probe['error'] === ServiceHealthProbeService::ERROR_SUBSYSTEM_FAILED) {
            return 'Health probe subsystem degraded before '.$label.' target response.';
        }

        return match ($probe['status']) {
            'healthy' => $label.' is reachable and responding quickly.',
            'unknown' => $this->unknownServiceSummary($label, $probe['error']),
            'down' => $label.' is unreachable'.$error,
            default => $label.' is degraded'.$error,
        };
    }

    private function unknownServiceSummary(string $label, mixed $error): string
    {
        if ($error === 'Target URL is not configured.' || $error === 'Unknown target service key.') {
            return $label.' observability target is not configured: '.$error;
        }

        $suffix = is_string($error) && $error !== '' ? ': '.$error : '.';

        return $label.' observability telemetry is unavailable'.$suffix;
    }

    /**
     * @return array<string, int|float>
     */
    private function authFunnel(): array
    {
        return Cache::remember('admin_observability_summary:auth_funnel', $this->summaryMetricsTtl(), function (): array {
            $counts = $this->outcomeCounts(AuthenticationAuditEvent::class);
            $total = array_sum($counts);
            $failed = $counts['failed'] ?? 0;
            $succeeded = $counts['succeeded'] ?? 0;

            return [
                'total_15m' => $total,
                'succeeded_15m' => $succeeded,
                'failed_15m' => $failed,
                'failure_rate_percent' => $total === 0 ? 0.0 : round(($failed / $total) * 100, 2),
            ];
        });
    }

    /**
     * @return array<string, int|float>
     */
    private function adminActivity(): array
    {
        return Cache::remember('admin_observability_summary:admin_activity', $this->summaryMetricsTtl(), function (): array {
            $counts = $this->outcomeCounts(AdminAuditEvent::class);
            $total = array_sum($counts);
            $denied = $counts['denied'] ?? 0;

            return [
                'total_15m' => $total,
                'denied_15m' => $denied,
                'denied_rate_percent' => $total === 0 ? 0.0 : round(($denied / $total) * 100, 2),
            ];
        });
    }

    /**
     * @param  class-string<AdminAuditEvent|AuthenticationAuditEvent>  $modelClass
     * @return array<string, int>
     */
    private function outcomeCounts(string $modelClass): array
    {
        $start = now()->subMinutes(15);
        $counts = [];

        foreach ($modelClass::query()
            ->selectRaw('outcome, count(*) as aggregate')
            ->where('occurred_at', '>=', $start)
            ->groupBy('outcome')
            ->get() as $row) {
            $outcome = (string) $row->getAttribute('outcome');
            $counts[$outcome] = (int) $row->getAttribute('aggregate');
        }

        return $counts;
    }

    private function summaryMetricsTtl(): int
    {
        return max(1, (int) config('sso.observability.summary_metrics_cache_ttl_seconds', 30));
    }

    private function recentEventsTtl(): int
    {
        return max(1, (int) config('sso.observability.recent_events_cache_ttl_seconds', 5));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recentCorrelatedEvents(): array
    {
        return Cache::remember('admin_observability_summary:recent_events', $this->recentEventsTtl(), function (): array {
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
                static function (array $a, array $b): int {
                    $occurredAt = strcmp((string) ($b['occurred_at'] ?? ''), (string) ($a['occurred_at'] ?? ''));
                    if ($occurredAt !== 0) {
                        return $occurredAt;
                    }

                    return strcmp(
                        (string) $b['service'].'|'.(string) $b['id'],
                        (string) $a['service'].'|'.(string) $a['id'],
                    );
                },
            );

            return array_slice($events, 0, 10);
        });
    }

    private function timestamp(mixed $value): ?string
    {
        return $value instanceof DateTimeInterface ? $value->format(DATE_ATOM) : null;
    }
}
