<?php

declare(strict_types=1);

namespace App\Actions\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use Illuminate\Support\Arr;

final class CreateExternalIdentityProviderAction
{
    public function __construct(
        private readonly ExternalIdentityProviderRegistry $registry,
        private readonly AdminAuditEventStore $auditEvents,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function execute(array $attributes): ExternalIdentityProvider
    {
        $provider = $this->registry->create($attributes);
        $this->audit($provider, $attributes);

        return $provider;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function audit(ExternalIdentityProvider $provider, array $attributes): void
    {
        $this->auditEvents->append([
            'action' => 'external_idp.create',
            'outcome' => 'success',
            'taxonomy' => 'external_idp.registry_created',
            'admin_subject_id' => (string) ($attributes['created_by_subject_id'] ?? 'system'),
            'admin_email' => (string) ($attributes['created_by_email'] ?? 'system@sso.local'),
            'admin_role' => (string) ($attributes['created_by_role'] ?? 'system'),
            'method' => 'SYSTEM',
            'path' => '/admin/api/idps',
            'ip_address' => '127.0.0.1',
            'reason' => 'externalIdp_external_idp_registry',
            'context' => $this->context($provider),
            'occurred_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function context(ExternalIdentityProvider $provider): array
    {
        return Arr::except($this->registry->publicView($provider), [
            'authorization_endpoint',
            'token_endpoint',
            'userinfo_endpoint',
            'jwks_uri',
        ]);
    }
}
