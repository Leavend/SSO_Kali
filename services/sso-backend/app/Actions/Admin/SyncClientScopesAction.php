<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use Illuminate\Http\Request;
use RuntimeException;

final class SyncClientScopesAction
{
    public function __construct(
        private readonly ScopePolicy $scopes,
        private readonly DownstreamClientRegistry $clients,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  list<string>  $scopeNames
     */
    public function execute(Request $request, User $admin, string $clientId, array $scopeNames): OidcClientRegistration
    {
        $registration = $this->registration($clientId);
        $allowedScopes = $this->scopes->normalizeAllowedScopes($scopeNames);

        $registration->forceFill(['allowed_scopes' => $allowedScopes])->save();
        $this->clients->flush();

        $registration = $registration->refresh();
        $this->audit->succeeded(
            'sync_client_scopes',
            $request,
            $admin,
            ['client_id' => $registration->client_id, 'allowed_scopes' => $allowedScopes],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $registration;
    }

    private function registration(string $clientId): OidcClientRegistration
    {
        $registration = OidcClientRegistration::query()->where('client_id', $clientId)->first();

        return $registration instanceof OidcClientRegistration
            ? $registration
            : throw new RuntimeException('Client registration not found.');
    }
}
