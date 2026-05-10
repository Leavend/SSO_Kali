<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpTokenExchangeService;
use App\Support\Audit\AuthenticationAuditRecord;
use Throwable;

final class ExchangeExternalIdpCallbackTokenAction
{
    public function __construct(
        private readonly ExternalIdpTokenExchangeService $exchange,
        private readonly AdminAuditEventStore $auditEvents,
        private readonly RecordExternalIdpSecurityIncidentAction $securityIncidents,
        private readonly RecordAuthenticationAuditEventAction $authenticationAudits,
    ) {}

    /**
     * @return array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}
     */
    public function execute(ExternalIdentityProvider $provider, string $state, string $code, string $requestId = 'system'): array
    {
        try {
            $result = $this->exchange->exchange($provider, $state, $code);
            $this->audit($provider, 'success', $requestId, $result['subject'], null);
            $this->recordAuthenticationAudit($provider, 'external_idp_callback_exchanged', 'succeeded', $requestId, $state, $code, $result, null);

            return $result;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $requestId, null, $exception);
            $this->recordAuthenticationAudit($provider, 'external_idp_callback_failed', 'failed', $requestId, $state, $code, null, $exception);
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
            'reason' => 'externalIdp_external_idp_callback_exchange',
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

    /**
     * @param  array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}|null  $result
     */
    private function recordAuthenticationAudit(
        ExternalIdentityProvider $provider,
        string $eventType,
        string $outcome,
        string $requestId,
        string $state,
        string $code,
        ?array $result,
        ?Throwable $exception,
    ): void {
        $this->authenticationAudits->execute(AuthenticationAuditRecord::externalIdpAuthentication(
            eventType: $eventType,
            outcome: $outcome,
            subjectId: $result['subject'] ?? null,
            email: $result['email'] ?? null,
            clientId: $provider->client_id,
            sessionId: null,
            ipAddress: '127.0.0.1',
            userAgent: 'system',
            errorCode: $exception === null ? null : $this->errorCode($exception),
            requestId: $requestId,
            context: array_filter([
                'provider_key' => $provider->provider_key,
                'issuer_hash' => hash('sha256', $provider->issuer),
                'state_hash' => hash('sha256', $state),
                'code_hash' => hash('sha256', $code),
                'return_to_hash' => $this->hashValue($result['return_to'] ?? null),
                'external_subject_hash' => $this->hashValue($result['subject'] ?? null),
            ], static fn (mixed $value): bool => $value !== null),
        ));
    }

    private function errorCode(Throwable $exception): string
    {
        return str($exception->getMessage())->snake()->limit(80, '')->toString();
    }

    private function hashValue(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? hash('sha256', $value) : null;
    }
}
