<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\ClientIntegrationDraft;

final class ClientProvisioningReadinessBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(ClientIntegrationDraft $draft): array
    {
        return [
            'mode' => $draft->provisioning,
            'identitySource' => $this->identitySource(),
            'requiredSchemas' => $this->requiredSchemas($draft),
            'userMapping' => $this->userMapping(),
            'groupMapping' => $this->groupMapping($draft),
            'deprovisioning' => $this->deprovisioning($draft),
            'auditEvidence' => $this->auditEvidence($draft),
            'riskGates' => $this->riskGates($draft),
        ];
    }

    private function identitySource(): string
    {
        return 'SSO broker at '.rtrim((string) config('sso.base_url'), '/');
    }

    /**
     * @return list<string>
     */
    private function requiredSchemas(ClientIntegrationDraft $draft): array
    {
        if ($draft->provisioning === 'scim') {
            return ['SCIM User resource', 'SCIM Group resource', 'ServiceProviderConfig discovery'];
        }

        return ['OIDC ID token claims', 'UserInfo profile claims'];
    }

    /**
     * @return list<string>
     */
    private function userMapping(): array
    {
        return ['sub -> external_id', 'email -> primary email', 'name -> display name', 'active -> local access state'];
    }

    /**
     * @return list<string>
     */
    private function groupMapping(ClientIntegrationDraft $draft): array
    {
        if ($draft->provisioning === 'scim') {
            return ['SCIM Groups -> local roles', 'SCIM memberships -> authorization grants'];
        }

        return ['roles claim -> local roles', 'groups claim optional for read-only access'];
    }

    /**
     * @return list<string>
     */
    private function deprovisioning(ClientIntegrationDraft $draft): array
    {
        if ($draft->provisioning === 'scim') {
            return ['SCIM active=false disables local account before next login', 'Back-channel logout revokes sessions by sid'];
        }

        return ['Back-channel logout revokes sessions by sid', 'Next login revalidates SSO account state'];
    }

    /**
     * @return list<string>
     */
    private function auditEvidence(ClientIntegrationDraft $draft): array
    {
        return [
            'Owner approval from '.$draft->ownerEmail,
            'Exact redirect and logout URI review',
            'Provisioning mode '.$draft->provisioning.' recorded in admin audit log',
        ];
    }

    /**
     * @return list<string>
     */
    private function riskGates(ClientIntegrationDraft $draft): array
    {
        $trafficGate = $draft->environment === 'live' ? 'Canary cohort before full cutover' : 'Isolated dev callback';

        return [$trafficGate, 'Refresh token rotation verified', 'Back-channel logout smoke test passed'];
    }
}
