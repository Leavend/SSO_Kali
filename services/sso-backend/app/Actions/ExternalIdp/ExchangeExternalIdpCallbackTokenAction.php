<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpTokenExchangeService;
use Throwable;

final class ExchangeExternalIdpCallbackTokenAction
{
    public function __construct(
        private readonly ExternalIdpTokenExchangeService $exchange,
        private readonly AdminAuditEventStore $auditEvents,
        private readonly RecordExternalIdpSecurityIncidentAction $securityIncidents,
    ) {}

    /**
     * @return array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}
     */
    public function execute(ExternalIdentityProvider $provider, string $state, string $code, string $requestId = 'system'): array
    {
        try {
            $result = $this->exchange->exchange($provider, $state, $code);
            $this->audit($provider, 'success', $requestId, $result['subject'], null);

            return $result;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $requestId, null, $exception);
            $this->securityIncidents->execute(
                'external_idp.callback.exchange_failure',
                'external_idp_callback_exchange_failed',
                $provider,
                ['state' => $state, 'code' => $code],
                $exception,
                $requestId,
                'critical',
            );

            throw $exception;
        }
    }

    private function audit(
        ExternalIdentityProvider $provider,
        string $outcome,
        string $requestId,
        ?string $subject,
        ?Throwable $exception,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.callback.exchange',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success'
                ? 'external_idp.callback_exchange_succeeded'
                : 'external_idp.callback_exchange_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'GET',
            'path' => '/external-idp/callback',
            'ip_address' => '127.0.0.1',
            'reason' => 'fr005_external_idp_callback_exchange',
            'context' => [
                'provider_key' => $provider->provider_key,
                'issuer' => $provider->issuer,
                'request_id' => $requestId,
                'subject' => $subject,
                'exception' => $exception?->getMessage(),
            ],
            'occurred_at' => now(),
        ]);
    }
}
