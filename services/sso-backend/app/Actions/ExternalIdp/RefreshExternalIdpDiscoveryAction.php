<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpDiscoveryService;
use Throwable;

final class RefreshExternalIdpDiscoveryAction
{
    public function __construct(
        private readonly ExternalIdpDiscoveryService $discovery,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function execute(ExternalIdentityProvider $provider, string $requestId = 'system'): array
    {
        try {
            $metadata = $this->discovery->refresh($provider);
            $this->audit($provider, 'success', $requestId, null);

            return $metadata;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $requestId, $exception);

            throw $exception;
        }
    }

    private function audit(
        ExternalIdentityProvider $provider,
        string $outcome,
        string $requestId,
        ?Throwable $exception,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.discovery.refresh',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success' ? 'external_idp.discovery_refreshed' : 'external_idp.discovery_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/admin/api/idps/'.$provider->provider_key.'/test-discovery',
            'ip_address' => '127.0.0.1',
            'reason' => 'fr005_external_idp_discovery',
            'context' => $this->context($provider, $requestId, $exception),
            'occurred_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function context(ExternalIdentityProvider $provider, string $requestId, ?Throwable $exception): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'metadata_url' => $provider->metadata_url,
            'request_id' => $requestId,
            'exception' => $exception?->getMessage(),
        ];
    }
}
