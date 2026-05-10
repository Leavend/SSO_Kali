<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\User;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalSubjectAccountMapper;
use App\Support\Audit\AuthenticationAuditRecord;
use Throwable;

final class LinkExternalSubjectAccountAction
{
    public function __construct(
        private readonly ExternalSubjectAccountMapper $mapper,
        private readonly AdminAuditEventStore $auditEvents,
        private readonly RecordExternalIdpSecurityIncidentAction $securityIncidents,
        private readonly RecordAuthenticationAuditEventAction $authenticationAudits,
    ) {}

    /**
     * @param  array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}  $exchange
     * @return array{user: User, link: ExternalSubjectLink, created_user: bool, created_link: bool}
     */
    public function execute(ExternalIdentityProvider $provider, array $exchange, string $requestId = 'system'): array
    {
        try {
            $result = $this->mapper->map($provider, $exchange);
            $this->audit($provider, $exchange, $requestId, 'success', $result['user'], null, $result);
            $this->recordAuthenticationAudit($provider, $exchange, 'external_idp_account_linked', 'succeeded', $requestId, $result['user'], $result, null);

            return $result;
        } catch (Throwable $exception) {
            $this->audit($provider, $exchange, $requestId, 'failure', null, $exception, null);
            $this->recordAuthenticationAudit($provider, $exchange, 'external_idp_account_link_failed', 'failed', $requestId, null, null, $exception);
            $this->securityIncidents->execute(
                'external_idp.account.link_failure',
                'external_idp_account_link_failed',
                $provider,
                $exchange,
                $exception,
                $requestId,
                'critical',
            );

            throw $exception;
        }
    }

    /**
     * @param  array<string, mixed>  $exchange
     * @param  array<string, mixed>|null  $result
     */
    private function audit(
        ExternalIdentityProvider $provider,
        array $exchange,
        string $requestId,
        string $outcome,
        ?User $user,
        ?Throwable $exception,
        ?array $result,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.account.link',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success'
                ? 'external_idp.account_linked'
                : 'external_idp.account_link_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'SYSTEM',
            'path' => '/external-idp/account-link',
            'ip_address' => '127.0.0.1',
            'reason' => 'externalIdp_external_subject_linking',
            'context' => [
                'provider_key' => $provider->provider_key,
                'issuer' => $provider->issuer,
                'request_id' => $requestId,
                'external_subject' => is_string($exchange['subject'] ?? null) ? $exchange['subject'] : null,
                'email' => is_string($exchange['email'] ?? null) ? $exchange['email'] : null,
                'user_subject_id' => $user?->subject_id,
                'created_user' => $result['created_user'] ?? null,
                'created_link' => $result['created_link'] ?? null,
                'exception' => $exception?->getMessage(),
            ],
            'occurred_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $exchange
     * @param  array<string, mixed>|null  $result
     */
    private function recordAuthenticationAudit(
        ExternalIdentityProvider $provider,
        array $exchange,
        string $eventType,
        string $outcome,
        string $requestId,
        ?User $user,
        ?array $result,
        ?Throwable $exception,
    ): void {
        $this->authenticationAudits->execute(AuthenticationAuditRecord::externalIdpAuthentication(
            eventType: $eventType,
            outcome: $outcome,
            subjectId: $user?->subject_id,
            email: is_string($exchange['email'] ?? null) ? $exchange['email'] : null,
            clientId: $provider->client_id,
            sessionId: null,
            ipAddress: '127.0.0.1',
            userAgent: 'system',
            errorCode: $exception === null ? null : $this->errorCode($exception),
            requestId: $requestId,
            context: array_filter([
                'provider_key' => $provider->provider_key,
                'issuer_hash' => hash('sha256', $provider->issuer),
                'external_subject_hash' => $this->hashValue($exchange['subject'] ?? null),
                'return_to_hash' => $this->hashValue($exchange['return_to'] ?? null),
                'created_user' => $result['created_user'] ?? null,
                'created_link' => $result['created_link'] ?? null,
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
