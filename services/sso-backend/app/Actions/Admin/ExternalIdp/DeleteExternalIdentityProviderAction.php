<?php

declare(strict_types=1);

namespace App\Actions\Admin\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;
use RuntimeException;

final class DeleteExternalIdentityProviderAction
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
    ) {}

    public function execute(Request $request, User $admin, string $providerKey): void
    {
        $provider = $this->find($providerKey);
        $context = $this->auditContext($provider);
        $provider->delete();

        $this->audit->succeeded(
            'delete_external_idp',
            $request,
            $admin,
            $context,
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );
    }

    private function find(string $providerKey): ExternalIdentityProvider
    {
        $provider = ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();

        return $provider instanceof ExternalIdentityProvider
            ? $provider
            : throw new RuntimeException('External IdP not found.');
    }

    /**
     * @return array<string, mixed>
     */
    private function auditContext(ExternalIdentityProvider $provider): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'enabled' => $provider->enabled,
            'had_secret_material' => $provider->client_secret_encrypted !== null,
        ];
    }
}
