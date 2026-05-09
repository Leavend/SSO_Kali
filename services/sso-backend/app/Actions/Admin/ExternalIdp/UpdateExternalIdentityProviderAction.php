<?php

declare(strict_types=1);

namespace App\Actions\Admin\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use RuntimeException;

final class UpdateExternalIdentityProviderAction
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Request $request, User $admin, string $providerKey, array $data): ExternalIdentityProvider
    {
        $provider = $this->find($providerKey);
        $provider->forceFill($this->payload($admin, $data))->save();
        $provider = $provider->refresh();

        $this->audit->succeeded(
            'update_external_idp',
            $request,
            $admin,
            $this->auditContext($provider, array_keys($data)),
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $provider;
    }

    private function find(string $providerKey): ExternalIdentityProvider
    {
        $provider = ExternalIdentityProvider::query()->where('provider_key', $providerKey)->first();

        return $provider instanceof ExternalIdentityProvider
            ? $provider
            : throw new RuntimeException('External IdP not found.');
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function payload(User $admin, array $data): array
    {
        $payload = array_intersect_key($data, array_flip($this->editableFields()));
        $payload['updated_by_subject_id'] = $admin->subject_id;

        if (array_key_exists('client_secret', $data)) {
            $payload['client_secret_encrypted'] = $this->encryptedSecret($data['client_secret']);
        }

        return $payload;
    }

    /**
     * @return list<string>
     */
    private function editableFields(): array
    {
        return [
            'display_name',
            'metadata_url',
            'client_id',
            'allowed_algorithms',
            'scopes',
            'priority',
            'enabled',
            'is_backup',
            'tls_validation_enabled',
            'signature_validation_enabled',
            'health_status',
        ];
    }

    private function encryptedSecret(mixed $secret): ?string
    {
        return is_string($secret) && $secret !== '' ? Crypt::encryptString($secret) : null;
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
