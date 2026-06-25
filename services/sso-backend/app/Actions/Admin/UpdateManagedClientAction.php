<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\WidgetOriginPolicy;
use Illuminate\Http\Request;
use RuntimeException;

final class UpdateManagedClientAction
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AdminAuditLogger $audit,
        private readonly WidgetOriginPolicy $widgetOrigins,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Request $request, User $admin, string $clientId, array $data): OidcClientRegistration
    {
        $registration = $this->findRegistration($clientId);

        $attributes = array_intersect_key($data, array_flip([
            'display_name',
            'owner_email',
            'redirect_uris',
            'post_logout_redirect_uris',
            'backchannel_logout_uri',
            'category',
        ]));

        $contract = $this->mergeContract($registration, $data);
        if ($contract !== null) {
            $attributes['contract'] = $contract;
        }

        $registration->forceFill($attributes)->save();

        $this->clients->flush();
        $this->widgetOrigins->flush();

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

    /**
     * Merge the contract-backed admin fields (widget CORS trust, extra trusted
     * redirect origins) into the registration's existing contract JSON, leaving
     * the rest of the contract untouched. Returns null when neither field was
     * submitted so the column is not rewritten needlessly.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null
     */
    private function mergeContract(OidcClientRegistration $registration, array $data): ?array
    {
        $touchesWidget = array_key_exists('widget_cors_trusted', $data);
        $touchesOrigins = array_key_exists('trusted_redirect_origins', $data);

        if (! $touchesWidget && ! $touchesOrigins) {
            return null;
        }

        $contract = is_array($registration->contract) ? $registration->contract : [];

        if ($touchesWidget) {
            $contract['widget_cors_trusted'] = (bool) $data['widget_cors_trusted'];
        }

        if ($touchesOrigins) {
            $origins = $data['trusted_redirect_origins'];
            $contract['trusted_redirect_origins'] = is_array($origins)
                ? array_values(array_unique(array_filter($origins, 'is_string')))
                : [];
        }

        return $contract;
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
