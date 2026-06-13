<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Support\Oidc\ClientIntegrationDraft;
use App\Support\Oidc\ClientUrlOrigin;
use App\Support\Security\ClientSecretHashPolicy;
use App\Support\Security\ClientSecretIssuer;
use App\Support\Security\IssuedClientSecret;
use Illuminate\Http\Request;
use RuntimeException;

final class ClientIntegrationRegistrationService
{
    public function __construct(
        private readonly ClientIntegrationContractBuilder $builder,
        private readonly ClientSecretHashPolicy $hashes,
        private readonly ClientSecretIssuer $secrets,
        private readonly AdminAuditLogger $audit,
        private readonly ClientIntegrationRollbackRevoker $revoker,
        private readonly DownstreamClientRegistry $clients,
    ) {}

    /**
     * @return list<string>
     */
    public function violations(ClientIntegrationDraft $draft): array
    {
        return [
            ...$this->builder->validate($draft),
            ...$this->dynamicConflictViolations($draft),
        ];
    }

    public function stage(Request $request, User $admin, ClientIntegrationDraft $draft): OidcClientRegistration
    {
        $this->assertValid($draft);
        $registration = OidcClientRegistration::query()->create($this->stagePayload($admin, $draft));
        $this->clients->flush();
        $this->auditSuccess('stage_client_integration', $request, $admin, $registration);

        return $registration;
    }

    /**
     * @return array{registration: OidcClientRegistration, plaintext_secret?: string}
     */
    public function create(Request $request, User $admin, ClientIntegrationDraft $draft): array
    {
        $this->assertValid($draft);
        $secret = $draft->clientType === 'confidential' ? $this->secrets->issue() : null;
        $registration = OidcClientRegistration::query()->create($this->creationPayload($admin, $draft, $secret));
        $this->clients->flush();
        $this->auditSuccess('create_client_integration', $request, $admin, $registration);

        return $secret instanceof IssuedClientSecret
            ? ['registration' => $registration, 'plaintext_secret' => $secret->plaintext]
            : ['registration' => $registration];
    }

    public function activate(Request $request, User $admin, string $clientId, ?string $secretHash): OidcClientRegistration
    {
        $registration = $this->stagedRegistration($clientId);

        if ($registration->status === 'decommissioned') {
            throw new RuntimeException('Cannot reactivate a decommissioned client.');
        }

        $this->assertActivationSecret($registration, $secretHash);
        $registration->update($this->activationPayload($admin, $secretHash));
        $this->clients->flush();
        $this->auditSuccess('activate_client_integration', $request, $admin, $registration->refresh());

        return $registration;
    }

    public function disable(Request $request, User $admin, string $clientId, ?string $reason = null): OidcClientRegistration
    {
        $registration = $this->rollbackRegistration($clientId);
        $outcome = $this->revoker->revoke($registration);

        $registration->update([
            'status' => 'disabled',
            'disabled_at' => now(),
            'disabled_reason' => $reason,
        ]);
        $this->clients->flush();
        $this->auditSuccess('disable_client_integration', $request, $admin, $registration->refresh(), $outcome);

        return $registration;
    }

    /**
     * FR-012 / UC-09: Permanently decommission a client.
     *
     * Irreversible — revokes all tokens, clears sensitive config,
     * and sets status to 'decommissioned'. Cannot be reactivated.
     *
     * Seeded clients (provisioning='seeded') are protected from decommission
     * because they represent infrastructure-critical integrations (SSO portal,
     * admin panel). Their lifecycle is managed through config deployment.
     */
    public function decommission(Request $request, User $admin, string $clientId, ?string $reason = null): OidcClientRegistration
    {
        $registration = $this->rollbackRegistration($clientId);

        if ($registration->provisioning === 'seeded') {
            throw new RuntimeException(
                'Klien seeded tidak dapat didecommission. Klien ini adalah infrastruktur inti SSO dan lifecyclenya dikelola melalui deployment konfigurasi.',
                403,
            );
        }

        $outcome = $this->revoker->revoke($registration);

        $registration->update([
            'status' => 'decommissioned',
            'disabled_at' => $registration->disabled_at ?? now(),
            'disabled_reason' => $reason ?? 'Decommissioned by admin.',
            'decommissioned_at' => now(),
            'allowed_scopes' => [],
            'redirect_uris' => [],
            'post_logout_redirect_uris' => [],
            'backchannel_logout_uri' => null,
            'secret_hash' => null,
        ]);
        $this->clients->flush();
        $this->auditSuccess('decommission_client_integration', $request, $admin, $registration->refresh(), $outcome);

        return $registration;
    }

    public function delete(Request $request, User $admin, string $clientId): void
    {
        $registration = $this->rollbackRegistration($clientId);

        if ($registration->provisioning === 'seeded') {
            throw new RuntimeException(
                'Klien seeded tidak dapat dihapus. Klien ini adalah infrastruktur inti SSO.',
                403,
            );
        }

        $this->revoker->revoke($registration);
        $registration->delete();
        $this->clients->flush();

        $this->audit->succeeded(
            'delete_client_integration',
            $request,
            $admin,
            [
                'client_id' => $clientId,
                'client_type' => $registration->type,
                'environment' => $registration->environment,
                'owner_email' => $registration->owner_email,
            ],
            AdminAuditTaxonomy::CLIENT_INTEGRATION_DELETED
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function registrations(): array
    {
        return OidcClientRegistration::query()
            ->latest('id')
            ->limit(50)
            ->get()
            ->map(fn (OidcClientRegistration $registration): array => $this->payload($registration))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(OidcClientRegistration $registration): array
    {
        return [
            ...$registration->only([
                'client_id', 'display_name', 'type', 'environment', 'app_base_url',
                'redirect_uris', 'post_logout_redirect_uris', 'backchannel_logout_uri',
                'allowed_scopes', 'owner_email', 'provisioning', 'status', 'activated_at', 'disabled_at',
            ]),
            'has_secret_hash' => is_string($registration->secret_hash) && $registration->secret_hash !== '',
        ];
    }

    private function assertValid(ClientIntegrationDraft $draft): void
    {
        $violations = $this->violations($draft);
        if ($violations !== []) {
            throw new RuntimeException(implode(' ', $violations));
        }
    }

    /**
     * @return list<string>
     */
    private function dynamicConflictViolations(ClientIntegrationDraft $draft): array
    {
        return array_values(array_filter([
            $this->clientIdExists($draft->clientId) ? 'Client ID sudah pernah distage di registry dinamis.' : null,
            $this->redirectUriExists($this->redirectUri($draft)) ? 'Redirect URI sudah distage di registry dinamis.' : null,
        ]));
    }

    private function clientIdExists(string $clientId): bool
    {
        return OidcClientRegistration::query()->where('client_id', $clientId)->exists();
    }

    private function redirectUriExists(string $redirectUri): bool
    {
        return OidcClientRegistration::query()
            ->whereJsonContains('redirect_uris', $redirectUri)
            ->where('status', '!=', 'disabled')
            ->exists();
    }

    private function redirectUri(ClientIntegrationDraft $draft): string
    {
        return ClientUrlOrigin::fromInput($draft->appBaseUrl).$draft->callbackPath;
    }

    /**
     * @return array<string, mixed>
     */
    private function stagePayload(User $admin, ClientIntegrationDraft $draft): array
    {
        $contract = $this->builder->build($draft);

        return [
            ...$this->contractPayload($draft, $contract),
            'contract' => $contract,
            'status' => 'staged',
            'staged_by_subject_id' => $admin->subject_id,
            'staged_by_email' => $admin->email,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function creationPayload(
        User $admin,
        ClientIntegrationDraft $draft,
        ?IssuedClientSecret $secret,
    ): array {
        return [
            ...$this->stagePayload($admin, $draft),
            ...$this->activationPayload($admin, $secret?->hash),
            'secret_rotated_at' => $secret?->issuedAt,
            'secret_expires_at' => $secret?->expiresAt,
        ];
    }

    /**
     * @param  array<string, mixed>  $contract
     * @return array<string, mixed>
     */
    private function contractPayload(ClientIntegrationDraft $draft, array $contract): array
    {
        $baseUrl = ClientUrlOrigin::fromInput($draft->appBaseUrl);

        return [
            'client_id' => $draft->clientId,
            'display_name' => $draft->appName,
            'type' => $draft->clientType,
            'environment' => $draft->environment,
            'app_base_url' => $baseUrl,
            'redirect_uris' => [(string) $contract['redirectUri']],
            'post_logout_redirect_uris' => [$baseUrl],
            'backchannel_logout_uri' => (string) $contract['backchannelLogoutUri'],
            'allowed_scopes' => $draft->allowedScopes,
            'owner_email' => $draft->ownerEmail,
            'provisioning' => $draft->provisioning,
        ];
    }

    private function stagedRegistration(string $clientId): OidcClientRegistration
    {
        return $this->registration($clientId, 'staged', 'Client integration belum dalam status staged.');
    }

    private function rollbackRegistration(string $clientId): OidcClientRegistration
    {
        return $this->registration($clientId, null, 'Client integration tidak ditemukan.');
    }

    private function registration(string $clientId, ?string $status, string $message): OidcClientRegistration
    {
        $query = OidcClientRegistration::query()->where('client_id', $clientId);
        $registration = $status === null ? $query->first() : $query->where('status', $status)->first();

        return $registration instanceof OidcClientRegistration ? $registration : throw new RuntimeException($message);
    }

    private function assertActivationSecret(OidcClientRegistration $registration, ?string $secretHash): void
    {
        if ($registration->type !== 'confidential') {
            return;
        }

        $this->hashes->assertCompliantHash((string) $secretHash);
    }

    /**
     * @return array<string, mixed>
     */
    private function activationPayload(User $admin, ?string $secretHash): array
    {
        return [
            'status' => 'active',
            'secret_hash' => $secretHash,
            'activated_by_subject_id' => $admin->subject_id,
            'activated_by_email' => $admin->email,
            'activated_at' => now(),
        ];
    }

    private function auditSuccess(
        string $action,
        Request $request,
        User $admin,
        OidcClientRegistration $registration,
        array $extra = [],
    ): void {
        $this->audit->succeeded($action, $request, $admin, $this->auditContext($registration, $extra), $this->taxonomy($action));
    }

    /**
     * @return array<string, mixed>
     */
    private function auditContext(OidcClientRegistration $registration, array $extra = []): array
    {
        return [
            'client_id' => $registration->client_id,
            'client_type' => $registration->type,
            'status' => $registration->status,
            'environment' => $registration->environment,
            'owner_email' => $registration->owner_email,
            ...$extra,
        ];
    }

    private function taxonomy(string $action): string
    {
        return match ($action) {
            'create_client_integration',
            'activate_client_integration' => AdminAuditTaxonomy::CLIENT_INTEGRATION_ACTIVATED,
            'disable_client_integration' => AdminAuditTaxonomy::CLIENT_INTEGRATION_DISABLED,
            'decommission_client_integration' => AdminAuditTaxonomy::CLIENT_INTEGRATION_DECOMMISSIONED,
            default => AdminAuditTaxonomy::CLIENT_INTEGRATION_STAGED,
        };
    }
}
