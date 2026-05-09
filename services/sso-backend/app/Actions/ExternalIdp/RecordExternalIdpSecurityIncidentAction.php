<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Support\Security\SensitiveAuditContextRedactor;
use Throwable;

final class RecordExternalIdpSecurityIncidentAction
{
    public function __construct(
        private readonly AdminAuditEventStore $auditEvents,
        private readonly SensitiveAuditContextRedactor $redactor,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(
        string $action,
        string $reason,
        ExternalIdentityProvider $provider,
        array $context = [],
        ?Throwable $exception = null,
        string $requestId = 'system',
        string $severity = 'high',
    ): void {
        $this->auditEvents->append([
            'action' => $action,
            'outcome' => 'denied',
            'taxonomy' => 'external_idp.security_incident',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/external-idp/security-incident',
            'ip_address' => '127.0.0.1',
            'reason' => $reason,
            'context' => $this->context($provider, $context, $exception, $requestId, $severity),
            'occurred_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function context(
        ExternalIdentityProvider $provider,
        array $context,
        ?Throwable $exception,
        string $requestId,
        string $severity,
    ): array {
        return $this->redactor->incidentContext([
            ...$context,
            'request_id' => $requestId,
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'severity' => $severity,
            'classification' => 'external_identity_provider',
        ], $exception);
    }
}
