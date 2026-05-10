<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use App\Support\Audit\AuthenticationAuditRecord;
use Throwable;

final class CreateExternalIdpAuthenticationRedirectAction
{
    public function __construct(
        private readonly ExternalIdpAuthenticationRedirectService $redirects,
        private readonly AdminAuditEventStore $auditEvents,
        private readonly RecordExternalIdpSecurityIncidentAction $securityIncidents,
        private readonly RecordAuthenticationAuditEventAction $authenticationAudits,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
     */
    public function execute(ExternalIdentityProvider $provider, array $context = []): array
    {
        try {
            $redirect = $this->redirects->create($provider, $context);
            $this->audit($provider, 'success', $context, null);
            $this->recordAuthenticationAudit($provider, 'external_idp_redirect_created', 'succeeded', $context, null);

            return $redirect;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $context, $exception);
            $this->recordAuthenticationAudit($provider, 'external_idp_redirect_failed', 'failed', $context, $exception);
            $this->securityIncidents->execute(
                'external_idp.auth.redirect_failure',
                'external_idp_auth_redirect_failed',
                $provider,
                $context,
                $exception,
                $this->contextString($context, 'request_id', 'system'),
            );

            throw $exception;
        }
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function audit(
        ExternalIdentityProvider $provider,
        string $outcome,
        array $context,
        ?Throwable $exception,
    ): void {
        $this->auditEvents->append([
            'action' => 'external_idp.auth.redirect',
            'outcome' => $outcome,
            'taxonomy' => $outcome === 'success'
                ? 'external_idp.auth_redirect_created'
                : 'external_idp.auth_redirect_failed',
            'admin_subject_id' => 'system',
            'admin_email' => 'system@sso.local',
            'admin_role' => 'system',
            'method' => 'GET',
            'path' => '/external-idp/'.$provider->provider_key.'/authorize',
            'ip_address' => $this->contextString($context, 'ip_address', '127.0.0.1'),
            'reason' => 'externalIdp_external_idp_auth_redirect',
            'context' => $this->auditContext($provider, $context, $exception),
            'occurred_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function auditContext(ExternalIdentityProvider $provider, array $context, ?Throwable $exception): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'request_id' => $this->contextString($context, 'request_id', 'n/a'),
            'return_to' => $this->contextString($context, 'return_to', null),
            'prompt' => $this->contextString($context, 'prompt', null),
            'exception' => $exception?->getMessage(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function recordAuthenticationAudit(
        ExternalIdentityProvider $provider,
        string $eventType,
        string $outcome,
        array $context,
        ?Throwable $exception,
    ): void {
        $this->authenticationAudits->execute(AuthenticationAuditRecord::externalIdpAuthentication(
            eventType: $eventType,
            outcome: $outcome,
            subjectId: null,
            email: null,
            clientId: $provider->client_id,
            sessionId: null,
            ipAddress: $this->contextString($context, 'ip_address', '127.0.0.1'),
            userAgent: $this->contextString($context, 'user_agent', 'system'),
            errorCode: $exception === null ? null : $this->errorCode($exception),
            requestId: $this->contextString($context, 'request_id', 'system'),
            context: array_filter([
                'provider_key' => $provider->provider_key,
                'issuer_hash' => hash('sha256', $provider->issuer),
                'return_to_hash' => $this->hashContextValue($context, 'return_to'),
                'prompt' => $this->contextString($context, 'prompt', null),
            ], static fn (mixed $value): bool => $value !== null),
        ));
    }

    private function errorCode(Throwable $exception): string
    {
        return str($exception->getMessage())->snake()->limit(80, '')->toString();
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function hashContextValue(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? hash('sha256', $value) : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function contextString(array $context, string $key, ?string $fallback): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : $fallback;
    }
}
