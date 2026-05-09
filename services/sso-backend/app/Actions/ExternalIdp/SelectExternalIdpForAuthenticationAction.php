<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpFailoverPolicy;
use Throwable;

final class SelectExternalIdpForAuthenticationAction
{
    public function __construct(
        private readonly ExternalIdpFailoverPolicy $policy,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @return array{provider: ExternalIdentityProvider, mode: string, candidates: list<array<string, mixed>>}
     */
    public function execute(?string $preferredProviderKey = null, string $requestId = 'system'): array
    {
        try {
            $selection = $this->policy->select($preferredProviderKey);
            $this->audit('success', $requestId, $preferredProviderKey, $selection, null);

            return $selection;
        } catch (Throwable $exception) {
            $this->audit('failure', $requestId, $preferredProviderKey, null, $exception);

            throw $exception;
        }
    }

    /**
     * @param  array{provider: ExternalIdentityProvider, mode: string, candidates: list<array<string, mixed>>}|null  $selection
     */
    private function audit(
        string $outcome,
        string $requestId,
        ?string $preferredProviderKey,
        ?array $selection,
        ?Throwable $exception,
    ): void {
        $provider = $selection['provider'] ?? null;
        $this->auditEvents->append([
            'action' => 'external_idp.failover.select',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success'
                ? 'external_idp.failover_selected'
                : 'external_idp.failover_unavailable',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/external-idp/failover/select',
            'ip_address' => '127.0.0.1',
            'reason' => 'fr005_external_idp_failover_policy',
            'context' => [
                'request_id' => $requestId,
                'preferred_provider_key' => $preferredProviderKey,
                'selected_provider_key' => $provider instanceof ExternalIdentityProvider ? $provider->provider_key : null,
                'selected_is_backup' => $provider instanceof ExternalIdentityProvider ? $provider->is_backup : null,
                'selected_priority' => $provider instanceof ExternalIdentityProvider ? $provider->priority : null,
                'mode' => $selection['mode'] ?? null,
                'candidates' => $selection['candidates'] ?? [],
                'exception' => $exception?->getMessage(),
            ],
            'occurred_at' => now(),
        ]);
    }
}
