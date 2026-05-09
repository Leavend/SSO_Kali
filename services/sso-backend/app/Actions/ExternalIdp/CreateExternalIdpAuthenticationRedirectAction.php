<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use Throwable;

final class CreateExternalIdpAuthenticationRedirectAction
{
    public function __construct(
        private readonly ExternalIdpAuthenticationRedirectService $redirects,
        private readonly AdminAuditEventStore $auditEvents,
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

            return $redirect;
        } catch (Throwable $exception) {
            $this->audit($provider, 'failure', $context, $exception);

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
            'reason' => 'fr005_external_idp_auth_redirect',
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
    private function contextString(array $context, string $key, ?string $fallback): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : $fallback;
    }
}
