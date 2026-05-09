<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Http\Request;
use RuntimeException;

final class UpdateManagedClientAction
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Request $request, User $admin, string $clientId, array $data): OidcClientRegistration
    {
        $registration = $this->findRegistration($clientId);
        $registration->forceFill(array_intersect_key($data, array_flip([
            'display_name',
            'owner_email',
            'redirect_uris',
            'post_logout_redirect_uris',
            'backchannel_logout_uri',
        ])))->save();

        $this->clients->flush();

        $registration = $registration->refresh();
        $this->audit->succeeded(
            'update_managed_client',
            $request,
            $admin,
            $this->auditContext($registration, array_keys($data)),
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $registration;
    }

    private function findRegistration(string $clientId): OidcClientRegistration
    {
        $registration = OidcClientRegistration::query()->where('client_id', $clientId)->first();

        return $registration instanceof OidcClientRegistration
            ? $registration
            : throw new RuntimeException('Client registration not found.');
    }

    /**
     * @param  list<string>  $changedFields
     * @return array<string, mixed>
     */
    private function auditContext(OidcClientRegistration $registration, array $changedFields): array
    {
        return [
            'client_id' => $registration->client_id,
            'status' => $registration->status,
            'owner_email' => $registration->owner_email,
            'changed_fields' => array_values(array_diff($changedFields, ['secret_hash', 'client_secret'])),
        ];
    }
}
