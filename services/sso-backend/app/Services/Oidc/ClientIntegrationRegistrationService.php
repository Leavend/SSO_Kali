<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Support\Oidc\ClientIntegrationDraft;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Http\Request;
use RuntimeException;

final class ClientIntegrationRegistrationService
{
    public function __construct(
        private readonly ClientIntegrationContractBuilder $builder,
        private readonly ClientSecretHashPolicy $hashes,
        private readonly AdminAuditLogger $audit,
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
        $this->auditSuccess('stage_client_integration', $request, $admin, $registration);

        return $registration;
    }

    public function activate(Request $request, User $admin, string $clientId, ?string $secretHash): OidcClientRegistration
    {
        $registration = $this->stagedRegistration($clientId);
        $this->assertActivationSecret($registration, $secretHash);
        $registration->update($this->activationPayload($admin, $secretHash));
        $this->auditSuccess('activate_client_integration', $request, $admin, $registration->refresh());

        return $registration;
    }

    public function disable(Request $request, User $admin, string $clientId): OidcClientRegistration
    {
        $registration = $this->rollbackRegistration($clientId);
        $registration->update(['status' => 'disabled', 'disabled_at' => now()]);
        $this->auditSuccess('disable_client_integration', $request, $admin, $registration->refresh());

        return $registration;
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
                'owner_email', 'provisioning', 'status', 'activated_at', 'disabled_at',
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
        return rtrim($draft->appBaseUrl, '/').$draft->callbackPath;
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
     * @param  array<string, mixed>  $contract
     * @return array<string, mixed>
     */
    private function contractPayload(ClientIntegrationDraft $draft, array $contract): array
    {
        return [
            'client_id' => $draft->clientId,
            'display_name' => $draft->appName,
            'type' => $draft->clientType,
            'environment' => $draft->environment,
            'app_base_url' => rtrim($draft->appBaseUrl, '/'),
            'redirect_uris' => [(string) $contract['redirectUri']],
            'post_logout_redirect_uris' => [rtrim($draft->appBaseUrl, '/')],
            'backchannel_logout_uri' => (string) $contract['backchannelLogoutUri'],
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
    ): void {
        $this->audit->succeeded($action, $request, $admin, $this->auditContext($registration), $this->taxonomy($action));
    }

    /**
     * @return array<string, mixed>
     */
    private function auditContext(OidcClientRegistration $registration): array
    {
        return [
            'client_id' => $registration->client_id,
            'client_type' => $registration->type,
            'status' => $registration->status,
            'environment' => $registration->environment,
            'owner_email' => $registration->owner_email,
        ];
    }

    private function taxonomy(string $action): string
    {
        return match ($action) {
            'activate_client_integration' => AdminAuditTaxonomy::CLIENT_INTEGRATION_ACTIVATED,
            'disable_client_integration' => AdminAuditTaxonomy::CLIENT_INTEGRATION_DISABLED,
            default => AdminAuditTaxonomy::CLIENT_INTEGRATION_STAGED,
        };
    }
}
