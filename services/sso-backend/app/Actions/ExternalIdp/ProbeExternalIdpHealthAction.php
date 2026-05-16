<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpHealthProbeService;
use Throwable;

final class ProbeExternalIdpHealthAction
{
    public function __construct(
        private readonly ExternalIdpHealthProbeService $healthProbe,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @return array{provider_key: string, enabled: bool, healthy: bool, status: string, latency_ms: float|null, checked_at: string, error: string|null, consecutive_failures: int, breaker_tripped: bool}
     */
    public function execute(ExternalIdentityProvider $provider, string $requestId = 'system'): array
    {
        try {
            $result = $this->healthProbe->probe($provider);
            $this->audit($provider, $requestId, $result, null);

            return $result;
        } catch (Throwable $exception) {
            $this->audit($provider, $requestId, null, $exception);

            throw $exception;
        }
    }

    /**
     * @param  array<string, mixed>|null  $result
     */
    private function audit(
        ExternalIdentityProvider $provider,
        string $requestId,
        ?array $result,
        ?Throwable $exception,
    ): void {
        $healthy = ($result['healthy'] ?? false) === true;
        $this->auditEvents->append([
            'action' => 'external_idp.health.probe',
            'outcome' => $exception === null && $healthy ? 'success' : 'failure',
            'taxonomy' => $exception === null && $healthy
                ? 'external_idp.health_healthy'
                : 'external_idp.health_unhealthy',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/external-idp/health/probe',
            'ip_address' => '127.0.0.1',
            'reason' => 'externalIdp_external_idp_health_probe',
            'context' => [
                'request_id' => $requestId,
                'provider_key' => $provider->provider_key,
                'issuer' => $provider->issuer,
                'status' => $result['status'] ?? null,
                'latency_ms' => $result['latency_ms'] ?? null,
                'error' => $exception?->getMessage() ?? ($result['error'] ?? null),
            ],
            'occurred_at' => now(),
        ]);
    }
}
