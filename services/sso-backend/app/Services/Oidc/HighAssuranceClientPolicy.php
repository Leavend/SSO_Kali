<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\DownstreamClient;

final class HighAssuranceClientPolicy
{
    /**
     * Valid OIDC prompt values per OpenID Connect Core §3.1.2.1.
     * The validator owns prompt=none acceptance and response semantics.
     */
    private const VALID_PROMPTS = ['login', 'consent', 'select_account'];

    public function promptFor(DownstreamClient $client, ?string $requestedPrompt): ?string
    {
        if ($requestedPrompt !== null && in_array($requestedPrompt, self::VALID_PROMPTS, true)) {
            return $requestedPrompt;
        }

        return $requestedPrompt;
    }

    public function maxAgeFor(DownstreamClient $client): ?string
    {
        if (! $this->isAdminPanelClient($client)) {
            return null;
        }

        $seconds = (int) config('sso.admin.freshness.read_seconds', 900);

        return (string) max(1, $seconds);
    }

    public function requiresInteractiveLogin(DownstreamClient $client): bool
    {
        return false;
    }

    private function isAdminPanelClient(DownstreamClient $client): bool
    {
        return $client->clientId === $this->adminPanelClientId();
    }

    private function adminPanelClientId(): string
    {
        return (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}
