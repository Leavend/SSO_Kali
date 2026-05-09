<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpClaimsMapper;
use Throwable;

final class MapExternalIdpClaimsAction
{
    public function __construct(
        private readonly ExternalIdpClaimsMapper $claimsMapper,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @param  array<string, mixed>  $claims
     * @return array{provider_key: string, subject: string, email: ?string, name: ?string, username: ?string, email_verified: bool, claims: array<string, mixed>}
     */
    public function execute(ExternalIdentityProvider $provider, array $claims, string $requestId = 'system'): array
    {
        try {
            $mapped = $this->claimsMapper->map($provider, $claims);
            $this->audit($provider, $requestId, $mapped, null);

            return $mapped;
        } catch (Throwable $exception) {
            $this->audit($provider, $requestId, null, $exception);

            throw $exception;
        }
    }

    /**
     * @param  array<string, mixed>|null  $mapped
     */
    private function audit(
        ExternalIdentityProvider $provider,
        string $requestId,
        ?array $mapped,
        ?Throwable $exception,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.claims.map',
            'outcome' => $exception === null ? 'success' : 'failure',
            'taxonomy' => $exception === null
                ? 'external_idp.claims_mapped'
                : 'external_idp.claims_mapping_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/external-idp/claims/map',
            'ip_address' => '127.0.0.1',
            'reason' => 'externalIdp_external_idp_claims_mapping',
            'context' => [
                'request_id' => $requestId,
                'provider_key' => $provider->provider_key,
                'issuer' => $provider->issuer,
                'subject' => $mapped['subject'] ?? null,
                'email' => $mapped['email'] ?? null,
                'email_verified' => $mapped['email_verified'] ?? null,
                'exception' => $exception?->getMessage(),
            ],
            'occurred_at' => now(),
        ]);
    }
}
