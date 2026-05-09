<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpJwksService;
use Throwable;

final class RefreshExternalIdpJwksAction
{
    public function __construct(
        private readonly ExternalIdpJwksService $jwks,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function execute(
        ExternalIdentityProvider $provider,
        ?string $expectedKid = null,
        string $requestId = 'system',
    ): array {
        try {
            $document = $this->jwks->refresh($provider, $expectedKid);
            $this->audit($provider, 'success', $requestId, $expectedKid, null);

            return $document;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $requestId, $expectedKid, $exception);

            throw $exception;
        }
    }

    private function audit(
        ExternalIdentityProvider $provider,
        string $outcome,
        string $requestId,
        ?string $expectedKid,
        ?Throwable $exception,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.jwks.refresh',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success' ? 'external_idp.jwks_refreshed' : 'external_idp.jwks_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/admin/api/idps/'.$provider->provider_key.'/jwks/refresh',
            'ip_address' => '127.0.0.1',
            'reason' => 'fr005_external_idp_jwks',
            'context' => $this->context($provider, $requestId, $expectedKid, $exception),
            'occurred_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function context(
        ExternalIdentityProvider $provider,
        string $requestId,
        ?string $expectedKid,
        ?Throwable $exception,
    ): array {
        return [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'jwks_uri' => $provider->jwks_uri,
            'expected_kid' => $expectedKid,
            'request_id' => $requestId,
            'exception' => $exception?->getMessage(),
        ];
    }
}
