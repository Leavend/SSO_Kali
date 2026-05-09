<?php

declare(strict_types=1);

namespace App\Actions\Admin\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use Illuminate\Http\Request;

final class StoreExternalIdentityProviderAction
{
    public function __construct(
        private readonly ExternalIdentityProviderRegistry $registry,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Request $request, User $admin, array $data): ExternalIdentityProvider
    {
        $provider = $this->registry->create([
            ...$data,
            'created_by_subject_id' => $admin->subject_id,
            'created_by_email' => $admin->email,
            'created_by_role' => $admin->role,
        ]);

        $this->audit->succeeded(
            'create_external_idp',
            $request,
            $admin,
            $this->auditContext($provider, array_keys($data)),
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $provider;
    }

    /**
     * @param  list<string>  $changedFields
     * @return array<string, mixed>
     */
    private function auditContext(ExternalIdentityProvider $provider, array $changedFields): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'enabled' => $provider->enabled,
            'changed_fields' => array_values(array_diff($changedFields, ['client_secret'])),
            'has_secret_material' => $provider->client_secret_encrypted !== null,
        ];
    }
}
